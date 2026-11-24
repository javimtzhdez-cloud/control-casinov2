"""Carga una versión coherente de las reglas al actualizar Streamlit en caliente."""
from hashlib import sha256
from importlib.util import module_from_spec, spec_from_loader
from pathlib import Path
from threading import RLock
from types import ModuleType, SimpleNamespace
import sys

_CACHE = {}
_LOCK = RLock()


def load_runtime(root=None):
    root = Path(root or Path(__file__).parent).resolve()
    names = ('backend', 'storage', 'printing')
    sources = {name: (root / (name + '.py')).read_bytes() for name in names}
    digest = sha256(str(root).encode())
    for name in names:
        digest.update(name.encode() + b'\0' + sources[name] + b'\0')
    version = digest.hexdigest()
    with _LOCK:
        if version in _CACHE:
            return _CACHE[version]
        package_name = '_calderon_release_' + version
        package = ModuleType(package_name)
        package.__path__ = [str(root)]
        package.__package__ = package_name
        sys.modules[package_name] = package
        modules = {}
        try:
            for name in names:
                full_name = package_name + '.' + name
                path = root / (name + '.py')
                spec = spec_from_loader(full_name, loader=None, origin=str(path))
                module = module_from_spec(spec)
                module.__file__ = str(path)
                sys.modules[full_name] = module
                setattr(package, name, module)
                # Compilar los bytes leídos evita reutilizar módulos o .pyc antiguos.
                exec(compile(sources[name], str(path), 'exec'), module.__dict__)
                modules[name] = module
        except BaseException:
            for name in names:
                sys.modules.pop(package_name + '.' + name, None)
            sys.modules.pop(package_name, None)
            raise
        result = SimpleNamespace(version=version, **modules)
        _CACHE[version] = result
        return result
