import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const patch=await readFile(new URL('../sql/admin-unassign-pipeline.sql',import.meta.url),'utf8');
const ownerA='00000000-0000-0000-0000-000000000001',ownerB='00000000-0000-0000-0000-000000000002';
test('unassignment preserves pipeline history, reassignment transfers it, and failures remain atomic',async()=>{
 const db=new PGlite();
 await db.exec(`create table crm(id int primary key,assigned_user_id uuid,assigned text);
 create table sh_pipeline_records(id int primary key,crm_id text not null,salesperson_user_id uuid not null,notes text);
 insert into crm values(1,'${ownerA}','A'),(2,'${ownerA}','A');
 insert into sh_pipeline_records values(1,'1','${ownerA}','history one'),(2,'1','${ownerA}','history two');
 create function sh_pipeline_reassign_from_crm() returns trigger language plpgsql security definer set search_path='public' as $$
BEGIN
 IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
   UPDATE public.sh_pipeline_records SET salesperson_user_id=NEW.assigned_user_id WHERE crm_id=NEW.id::text;
 END IF;
 RETURN NEW;
END
$$;
 create trigger sh_pipeline_crm_assignment after update of assigned_user_id on crm for each row execute function sh_pipeline_reassign_from_crm();`);
 await assert.rejects(db.exec('update crm set assigned_user_id=null where id=1'),/not-null constraint/);
 assert.equal((await db.query('select assigned_user_id from crm where id=1')).rows[0].assigned_user_id,ownerA);
 await db.exec(patch);
 await db.exec("update crm set assigned_user_id=null,assigned='' where id=1");
 assert.equal((await db.query('select assigned_user_id from crm where id=1')).rows[0].assigned_user_id,null);
 assert((await db.query('select * from sh_pipeline_records')).rows.every(r=>r.salesperson_user_id===ownerA));
 await db.query('update crm set assigned_user_id=$1 where id=1',[ownerB]);
 assert((await db.query('select * from sh_pipeline_records')).rows.every(r=>r.salesperson_user_id===ownerB));
 assert.deepEqual((await db.query('select notes from sh_pipeline_records order by id')).rows.map(r=>r.notes),['history one','history two']);
 await db.exec('update crm set assigned_user_id=null where id=2');
 assert.equal((await db.query('select count(*)::int n from sh_pipeline_records')).rows[0].n,2);
 await db.exec(`create function reject_pipeline_change() returns trigger language plpgsql as $$begin raise exception 'Pipeline guard rejection';end$$;
 create trigger keep_pipeline_guard before update on sh_pipeline_records for each row execute function reject_pipeline_change();`);
 await assert.rejects(db.query('update crm set assigned_user_id=$1 where id=1',[ownerA]),/Pipeline guard rejection/);
 assert.equal((await db.query('select assigned_user_id from crm where id=1')).rows[0].assigned_user_id,ownerB);
 await db.close();
});
