import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,chmodSync } from 'node:fs';
import {dirname,resolve} from 'node:path';
export function openStore(path) {
 const p=resolve(path);mkdirSync(dirname(p),{recursive:true,mode:0o700});
 const db=new DatabaseSync(p);
 chmodSync(p,0o600);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=4000;');
 db.exec([
 'CREATE TABLE IF NOT EXISTS requests (',
 'id TEXT PRIMARY KEY,channel TEXT NOT NULL,category TEXT NOT NULL,question TEXT NOT NULL,',
 'email TEXT,chat_id TEXT,status TEXT NOT NULL,code_hash TEXT,code_expires INTEGER,',
 'attempts INTEGER NOT NULL DEFAULT 0,answer TEXT,created_at INTEGER NOT NULL,queued_at INTEGER,',
 'answered_at INTEGER,delivered_at INTEGER,updated_at INTEGER NOT NULL,delivery_error TEXT);',
 'CREATE INDEX IF NOT EXISTS request_queue ON requests(status,queued_at);',
 'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, window INTEGER NOT NULL,',
 'count INTEGER NOT NULL,PRIMARY KEY(key,window));',
 'CREATE TABLE IF NOT EXISTS telegram_updates (update_id INTEGER PRIMARY KEY,received_at INTEGER NOT NULL);',
 'CREATE TABLE IF NOT EXISTS deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,',
 'channel TEXT NOT NULL,state TEXT NOT NULL,attempted_at INTEGER NOT NULL,error_code TEXT,',
 'FOREIGN KEY(request_id) REFERENCES requests(id));'
 ].join(' '));
 return db;
}
export function consumeLimit(db,key,max,windowMs,t=Date.now()){
 const window=Math.floor(t/windowMs)*windowMs;
 const row=db.prepare('SELECT count FROM rate_limits WHERE key=? AND window=?').get(key,window);
 if ((row?.count??0)>=max) return false;
 db.prepare('INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key,window) DO UPDATE SET count=count+1').run(key,window);
 return true;
}
