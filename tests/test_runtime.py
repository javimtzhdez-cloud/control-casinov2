from pathlib import Path
from types import ModuleType
import shutil
import sys
from calderon_runtime import load_runtime

ROOT=Path(__file__).resolve().parents[1]


def test_runtime_ignores_stale_top_level_modules(monkeypatch):
    stale=ModuleType('backend')
    stale.today=lambda:None
    monkeypatch.setitem(sys.modules,'backend',stale)
    monkeypatch.setitem(sys.modules,'storage',ModuleType('storage'))
    monkeypatch.setitem(sys.modules,'printing',ModuleType('printing'))
    current=load_runtime(ROOT)
    assert callable(current.backend.prepare_envelopes)
    assert current.storage.validate is current.backend.validate
    assert current.storage.MemoryStore().read()[0]==current.backend.empty_state()
    assert load_runtime(ROOT) is current


def test_runtime_loads_changed_files_without_restarting_python(tmp_path):
    for name in ['backend.py','storage.py','printing.py']:
        shutil.copy(ROOT/name,tmp_path/name)
    path=tmp_path/'backend.py';latest=path.read_text()
    path.write_text(latest.replace('def prepare_envelopes(','def prepare_envelopes_v0('))
    previous=load_runtime(tmp_path)
    assert not hasattr(previous.backend,'prepare_envelopes')
    path.write_text(latest)
    current=load_runtime(tmp_path)
    assert current.version!=previous.version
    assert callable(current.backend.prepare_envelopes)
    assert current.storage.validate is current.backend.validate
    assert current.storage.MemoryStore().read()[0]==current.backend.empty_state()
