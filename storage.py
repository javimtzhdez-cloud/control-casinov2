"""Almacenamiento con control de revisión y solicitudes idempotentes."""
from copy import deepcopy
from threading import RLock
from contextlib import contextmanager
import json
from backend import empty_state, validate, assign_auto, uid

class Conflict(ValueError): pass

class MemoryStore:
    def __init__(self,initial=None):
        self.data=validate(initial or empty_state());self.revision=0;self.seen=set();self.lock=RLock()
    def read(self):
        with self.lock:return deepcopy(self.data),self.revision
    def save(self,raw,expected,request_id,actor='pruebas'):
        with self.lock:
            if request_id in self.seen:return self.read()
            if expected!=self.revision:raise Conflict('Otro cambio ya se guardó. Se cargaron los datos actuales; vuelve a intentar tu operación.')
            new=validate(raw);self.data=new;self.revision+=1;self.seen.add(request_id)
            return self.read()

class PostgresStore:
    def __init__(self,config): self.config=dict(config)
    def connect(self):
        import psycopg
        cfg=self.config
        params=dict(connect_timeout=10,prepare_threshold=None,options='-c statement_timeout=15000 -c lock_timeout=10000')
        if cfg.get('url'):
            from psycopg.conninfo import conninfo_to_dict
            params.update(conninfo_to_dict(cfg['url']))
        else:
            params.update({k:cfg[k] for k in ['host','user','password']})
            params.update(port=int(cfg.get('port',5432)),dbname=cfg.get('dbname','postgres'))
        params.setdefault('sslmode','require')
        if params['sslmode'] not in ['require','verify-ca','verify-full']:raise ValueError('La base debe usar una conexión cifrada.')
        return psycopg.connect(**params)
    def initialize(self):
        from psycopg.types.json import Jsonb
        with self.connect() as c:
            c.execute('SELECT pg_advisory_xact_lock(746102852)')
            c.execute('CREATE SCHEMA IF NOT EXISTS calderon_v2')
            c.execute('CREATE TABLE IF NOT EXISTS calderon_v2.state (id int PRIMARY KEY CHECK(id=1), revision bigint NOT NULL, payload jsonb NOT NULL)')
            c.execute('CREATE TABLE IF NOT EXISTS calderon_v2.requests (id text PRIMARY KEY, actor text NOT NULL, revision bigint NOT NULL, at timestamptz DEFAULT now())')
            c.execute('REVOKE ALL ON SCHEMA calderon_v2 FROM PUBLIC')
            c.execute('REVOKE ALL ON ALL TABLES IN SCHEMA calderon_v2 FROM PUBLIC')
            c.execute('INSERT INTO calderon_v2.state VALUES (1,0,%s) ON CONFLICT DO NOTHING',(Jsonb(empty_state()),))
    def read(self):
        with self.connect() as c:
            row=c.execute('SELECT payload,revision FROM calderon_v2.state WHERE id=1').fetchone()
            return row[0],row[1]
    def save(self,raw,expected,request_id,actor):
        from psycopg.types.json import Jsonb
        with self.connect() as c:
            current=c.execute('SELECT payload,revision FROM calderon_v2.state WHERE id=1 FOR UPDATE').fetchone()
            if c.execute('SELECT 1 FROM calderon_v2.requests WHERE id=%s',(request_id,)).fetchone():return current[0],current[1]
            if expected!=current[1]:raise Conflict('Otro usuario cambió los datos. Se cargó la última revisión; repite tu operación.')
            new=validate(raw);revision=current[1]+1
            c.execute('UPDATE calderon_v2.state SET payload=%s,revision=%s WHERE id=1',(Jsonb(new),revision))
            c.execute('INSERT INTO calderon_v2.requests(id,actor,revision) VALUES (%s,%s,%s)',(request_id,actor,revision))
        return new,revision
