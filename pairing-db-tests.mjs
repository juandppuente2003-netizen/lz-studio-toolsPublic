// Isolated PostgreSQL validation. Does not access the user's Supabase project.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);
 create table public.lz_profiles(id uuid primary key,blocked boolean default false);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;
 insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
 insert into public.lz_profiles select id,false from auth.users;`);
 await db.exec(await readFile('supabase/box-pairing.sql','utf8'));
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session=crypto.randomUUID(),secret='a'.repeat(64),claim=crypto.randomUUID();
 const user=async id=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);};
 const rpc=async(action,{id=session,key=secret,sdp=null,who=null}={})=>(await db.query('select public.lz_box_pair_exchange($1,$2,$3,$4,$5) as value',[action,id,key,sdp,who])).rows[0].value;
 await db.exec('set role anon');await user(null);await assert.rejects(()=>rpc('create',{sdp:'offer'}),/Inicia sesion/);
 await db.exec('reset role;set role authenticated');await user(owner);
 const created=await rpc('create',{sdp:'offer'});assert.equal(created.session,session);assert.ok(created.expires>Date.now());
 await assert.rejects(()=>rpc('create',{id:crypto.randomUUID(),sdp:'offer'}),/Espera dos/);
 await db.exec('reset role;set role anon');await user(null);
 await assert.rejects(()=>db.query('select * from lz_box_private.pairings'),/permission denied/);
 await assert.rejects(()=>rpc('offer',{key:'b'.repeat(64),who:claim}),/no permitido/);
 assert.equal((await rpc('offer',{who:claim})).sdp,'offer');
 await assert.rejects(()=>rpc('offer',{who:crypto.randomUUID()}),/ya fue escaneado/);
 await assert.rejects(()=>rpc('answer',{sdp:'answer',who:crypto.randomUUID()}),/invalida/);
 await rpc('answer',{sdp:'answer',who:claim});await rpc('answer',{sdp:'answer',who:claim});
 await assert.rejects(()=>rpc('answer',{sdp:'changed',who:claim}),/ya registrada/);
 await db.exec('reset role;set role authenticated');await user(other);await assert.rejects(()=>rpc('poll'),/no permitido/);
 await user(owner);assert.equal((await rpc('poll')).answer,'answer');await assert.rejects(()=>rpc('poll'),/expiro/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from lz_box_private.pairings')).rows[0].n,0);
 const expired=crypto.randomUUID();await user(owner);await rpc('create',{id:expired,sdp:'offer'});
 await db.query("update lz_box_private.pairings set created_at=now()-interval '10 seconds',expires_at=now()-interval '1 second' where id=$1",[expired]);
 await db.exec('set role anon');await user(null);await assert.rejects(()=>rpc('offer',{id:expired,who:claim}),/expiro/);
 await db.exec('reset role;set role authenticated');await user(owner);const revoke=crypto.randomUUID();await rpc('create',{id:revoke,sdp:'offer'});await rpc('remove',{id:revoke});
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from lz_box_private.pairings')).rows[0].n,0);
 console.log('PASS isolated PostgreSQL: ownership, no anonymous table access, 256-bit capability, single-phone claim, idempotent answer, competing answer rejection, consumption and expiry.');
}finally{await db.close();}
