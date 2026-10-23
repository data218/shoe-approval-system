import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { canApproveRequest, isManagement, USER_ROLE_OPTIONS, getRoleOptionValue, getRoleLabel, hasRecordedApproval } from '../src/lib/approvals.ts';

const migration = (name) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const ids = {
  employee: '00000000-0000-0000-0000-000000000001',
  admin: '00000000-0000-0000-0000-000000000002',
  manager: '00000000-0000-0000-0000-000000000003',
  secondManager: '00000000-0000-0000-0000-000000000004',
  legacy: '00000000-0000-0000-0000-000000000005',
};
const purchase = { supplier: 'Supplier', item_category: 'Shoes', item_name: 'Shoe', sku: 'SKU1', quantity: 2, unit_price: 150 };
const discount = { customer_name: 'Customer', customer_mobile: '9876543210', product_name: 'Shoe', brand: 'Brand', sku: 'SKU1', original_price: 1000, discount_amount: 100 };
let db;
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const asUser = async (id, fn) => {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(id ? 'SET ROLE authenticated' : 'SET ROLE anon');
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
};
const submit = (type = 'PURCHASE', details = purchase) => scalar(
  'SELECT to_jsonb(shoe_create_request($1, $2, $3, $4::jsonb))', [type, 'NORMAL', 'Business reason', JSON.stringify(details)]);
const cash = () => scalar("SELECT to_jsonb(shoe_petty_cash_create_request('Travel','Client visit',100))");
const act = (id, action = 'APPROVE', remarks = null) => scalar('SELECT to_jsonb(shoe_request_action($1,$2,$3))', [id, action, remarks]);
const actCash = (id, action = 'APPROVE', remarks = null) => scalar('SELECT to_jsonb(shoe_petty_cash_action($1,$2,$3))', [id, action, remarks]);
const pay = (id, amount) => scalar("SELECT to_jsonb(shoe_petty_cash_record_payment($1,$2,'Cash'))", [id, amount]);

// The repository's oldest migration uses unprefixed names. This isolated fixture
// supplies the established shoe_* base schema that the later migrations require.
async function setup() {
  db = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
    CREATE TABLE auth.users (
      instance_id uuid, id uuid PRIMARY KEY, aud text, role text, email text,
      encrypted_password text, email_confirmed_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz
    );
    CREATE TABLE auth.identities (
      id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
      provider_id text, identity_data jsonb, provider text,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
    CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  `);
  let initial = await migration('20261006000000_initial_schema');
  for (const name of ['profiles','requests','purchase_details','discount_details','audit_logs','notifications']) {
    initial = initial.replace(new RegExp(`\\b${name}\\b`, 'g'), `shoe_${name}`);
  }
  initial = initial.replace("'ADMIN', 'REQUESTER', 'NARENDRA', 'SANJEEV'", "'ADMIN', 'REQUESTER', 'NARENDRA', 'SANJEEV', 'L1_APPROVER', 'L2_APPROVER', 'ACCOUNT'");
  await db.exec(initial);
  await db.exec('ALTER TABLE shoe_requests ADD COLUMN image_url text;');
  await db.exec(await migration('20261017000000_shoe_petty_cash_module'));
  await db.exec(await migration('20261020150000_shoe_admin_create_user'));
  await db.exec(await migration('20261020200000_fix_petty_cash_settings_null'));
  await db.exec(await migration('20261025000000_add_email_to_shoe_profiles'));
  await db.exec(await migration('20261025000001_update_petty_cash_workflow'));
  for (const [name, id] of Object.entries(ids)) {
    await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, `${name}@example.test`]);
    const role = { admin: 'ADMIN', manager: 'NARENDRA', secondManager: 'SANJEEV', legacy: 'L1_APPROVER' }[name] || 'REQUESTER';
    await db.query('INSERT INTO shoe_profiles(id,full_name,employee_code,role) VALUES($1,$2,$2,$3)', [id, name, role]);
  }
  await db.exec(`
    INSERT INTO shoe_requests(display_id,type,requester_id,status,priority) VALUES
      ('PUR-2026-00042','PURCHASE','${ids.employee}','PENDING_NARENDRA','NORMAL'),
      ('DIS-2026-00030','DISCOUNT','${ids.employee}','FINAL_APPROVED','NORMAL');
    INSERT INTO shoe_petty_cash_requests(request_number,employee_id,created_by,expense_category,description,requested_amount,status,current_stage)
      VALUES('PC-LEGACY','${ids.employee}','${ids.employee}','Travel','Legacy pending request',100,'PENDING_EA','EA');
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `);
  await db.exec(await migration('20261026000000_single_management_approval'));
  await db.exec(await migration('20261027000000_sync_profile_emails'));
  await db.exec(await migration('20261028000000_admin_edit_user'));
  await db.query("INSERT INTO shoe_petty_cash_requests(request_number,employee_id,created_by,expense_category,description,requested_amount,approved_amount,status,current_stage) VALUES('PC-2026-00030',$1,$1,'Utilities','Legacy inconsistency',5000,5000,'APPROVED','PAYMENT')",[ids.employee]);
  await db.exec(await migration('20261029000000_verify_petty_cash_approval'));
}

test('single management approval: database migration and permissions', async (t) => {
  await setup();
  try {
    await t.test('migrates pending requests and removes legacy approval roles without changing completed decisions', async () => {
      assert.equal(await scalar("SELECT status FROM shoe_requests WHERE display_id='PUR-2026-00042'"), 'PENDING_MANAGEMENT');
      assert.equal(await scalar("SELECT status FROM shoe_requests WHERE display_id='DIS-2026-00030'"), 'FINAL_APPROVED');
      assert.equal(await scalar("SELECT current_stage FROM shoe_petty_cash_requests WHERE request_number='PC-LEGACY'"), 'MANAGEMENT');
      assert.equal(await scalar('SELECT role FROM shoe_profiles WHERE id=$1', [ids.legacy]), 'REQUESTER');
    });
    await t.test('every role can submit all three request types; totals and IDs are generated server-side', async () => {
      const displayIds = new Set();
      for (const id of Object.values(ids)) {
        await asUser(id, async () => {
          const p = await submit(); const d = await submit('DISCOUNT', discount); const c = await cash();
          assert.equal(p.status, 'PENDING_MANAGEMENT'); assert.equal(d.status, 'PENDING_MANAGEMENT');
          assert.equal(c.current_stage, 'MANAGEMENT'); assert.equal(c.status, 'PENDING_MANAGEMENT');
          assert.equal(c.requires_management_approval, true);
          assert.equal(c.approved_amount, null); assert.equal(Number(c.paid_amount), 0);
          assert.equal(Number(await scalar("SELECT count(*) FROM shoe_petty_cash_approval_history WHERE request_id=$1 AND decision='APPROVED'",[c.id])),0);
          assert.ok(!displayIds.has(p.display_id)); displayIds.add(p.display_id);
          assert.equal(Number(await scalar('SELECT total_amount FROM shoe_purchase_details WHERE request_id=$1',[p.id])),300);
          assert.equal(Number(await scalar('SELECT final_price FROM shoe_discount_details WHERE request_id=$1',[d.id])),900);
        });
      }
    });
    await t.test('requesters cannot approve, alter statuses directly, see other employees requests, or elevate roles', async () => {
      const p = await asUser(ids.manager, () => submit());
      await asUser(ids.employee, async () => {
        await assert.rejects(() => act(p.id), /Only management/);
        assert.equal((await db.query('UPDATE shoe_requests SET status=$1 WHERE id=$2 RETURNING id',['FINAL_APPROVED',p.id])).rows.length,0);
        assert.equal((await db.query('SELECT id FROM shoe_requests WHERE id=$1',[p.id])).rows.length,0);
        assert.equal((await db.query("UPDATE shoe_profiles SET role='ADMIN' WHERE id=$1 RETURNING id",[ids.employee])).rows.length,0);
        await assert.rejects(() => db.query("INSERT INTO shoe_petty_cash_requests(request_number,employee_id,created_by,expense_category,description,requested_amount,status) VALUES('BYPASS',$1,$1,'Travel','Bypass',100,'APPROVED')",[ids.employee]), /row-level security/);
      });
    });
    await t.test('a single management decision finalizes both purchase and discount; second decisions are refused', async () => {
      for (const [type, details] of [['PURCHASE',purchase],['DISCOUNT',discount]]) {
        const p = await asUser(ids.employee, () => submit(type,details));
        await asUser(ids.manager, async () => {
          assert.equal((await act(p.id)).status,'FINAL_APPROVED');
          await assert.rejects(() => act(p.id), /not awaiting/);
        });
        assert.equal(Number(await scalar("SELECT count(*) FROM shoe_audit_logs WHERE request_id=$1 AND action='APPROVE'",[p.id])),1);
      }
    });
    await t.test('rejection requires remarks and management cannot approve its own request; Admin can', async () => {
      const p = await asUser(ids.manager, () => submit());
      await asUser(ids.manager, () => assert.rejects(() => act(p.id), /own request/));
      await asUser(ids.secondManager, async () => {
        await assert.rejects(() => act(p.id,'REJECT'), /remarks/);
        assert.equal((await act(p.id,'REJECT','Not needed')).status,'REJECTED');
      });
      await asUser(ids.admin, async () => { const own = await submit(); assert.equal((await act(own.id)).status,'FINAL_APPROVED'); });
    });
    await t.test('petty cash needs exactly one approval; payments remain separate, partial and bounded', async () => {
      const c = await asUser(ids.employee, cash);
      await asUser(ids.employee, () => assert.rejects(() => actCash(c.id), /not authorised|own request/));
      await asUser(ids.manager, async () => {
        const approved = await actCash(c.id); assert.equal(approved.status,'APPROVED'); assert.equal(approved.current_stage,'PAYMENT');
        await assert.rejects(() => actCash(c.id), /not awaiting/);
        assert.equal((await pay(c.id,40)).status,'PARTIALLY_PAID');
        await assert.rejects(() => pay(c.id,61), /exceeds/);
        assert.equal((await pay(c.id,60)).status,'SETTLED');
      });
      await asUser(ids.employee, () => assert.rejects(() => pay(c.id,1), /not authorised/));
      assert.equal(Number(await scalar("SELECT count(*) FROM shoe_petty_cash_approval_history WHERE request_id=$1 AND decision='APPROVED'",[c.id])),1);
    });
    await t.test('returned petty cash can be corrected and resubmitted only to management', async () => {
      const c = await asUser(ids.employee,cash);
      await asUser(ids.manager, () => actCash(c.id,'RETURN','Attach receipt'));
      await asUser(ids.employee, async () => {
        await db.query("UPDATE shoe_petty_cash_requests SET description='Corrected' WHERE id=$1",[c.id]);
        await assert.rejects(() => db.query('UPDATE shoe_petty_cash_requests SET paid_amount=100 WHERE id=$1',[c.id]), /workflow/);
        const r = await scalar('SELECT to_jsonb(shoe_petty_cash_resubmit($1))',[c.id]);
        assert.equal(r.status,'PENDING_MANAGEMENT'); assert.equal(r.current_stage,'MANAGEMENT');
      });
    });
    await t.test('invalid discounts fail without partial database writes; unauthenticated submissions fail', async () => {
      const before = Number(await scalar('SELECT count(*) FROM shoe_requests'));
      await asUser(ids.employee, () => assert.rejects(() => submit('DISCOUNT',{...discount,discount_amount:1001}), /Discount/));
      assert.equal(Number(await scalar('SELECT count(*) FROM shoe_requests')),before);
      await asUser(null, () => assert.rejects(submit, /permission denied|authenticated/));
    });
    await t.test('Admin can create, edit, change roles, and remove the actual Auth user while preserving request history', async () => {
      const email='created@example.test';
      const created = await asUser(ids.admin, () => scalar("SELECT shoe_admin_create_user($1,'TestPass1!','Created user','EMP-CREATED','Sales','Main','REQUESTER')",[email]));
      await asUser(ids.admin, () => db.query("UPDATE shoe_profiles SET role='NARENDRA', full_name='Updated' WHERE id=$1",[created.id]));
      const req = await asUser(created.id, () => submit());
      await asUser(ids.employee, () => assert.rejects(() => db.query('SELECT shoe_admin_delete_user($1)',[created.id]), /Only administrators/));
      await asUser(ids.admin, () => db.query('SELECT shoe_admin_delete_user($1)',[created.id]));
      assert.equal(Number(await scalar('SELECT count(*) FROM auth.users WHERE id=$1',[created.id])),0);
      assert.equal(Number(await scalar('SELECT count(*) FROM shoe_profiles WHERE id=$1',[created.id])),0);
      assert.equal(await scalar('SELECT requester_id FROM shoe_requests WHERE id=$1',[req.id]),null);
      assert.equal(Number(await scalar('SELECT count(*) FROM shoe_audit_logs WHERE request_id=$1',[req.id])),1);
    });
    await t.test('requesters cannot change submitted details or forge approval history', async () => {
      const p = await asUser(ids.employee, () => submit());
      await asUser(ids.employee, async () => {
        assert.equal((await db.query('UPDATE shoe_purchase_details SET total_amount=1 WHERE request_id=$1 RETURNING id',[p.id])).rows.length,0);
        await assert.rejects(() => db.query("INSERT INTO shoe_audit_logs(request_id,user_id,action,new_status) VALUES($1,$2,'APPROVE','FINAL_APPROVED')",[p.id,ids.employee]), /row-level security/);
        await assert.rejects(() => db.query("INSERT INTO shoe_requests(display_id,type,requester_id,status,priority) VALUES('FORGED','PURCHASE',$1,'FINAL_APPROVED','NORMAL')",[ids.employee]), /row-level security/);
      });
    });
    await t.test('failed detail or audit writes roll back the entire submission or approval', async () => {
      const before = Number(await scalar('SELECT count(*) FROM shoe_requests'));
      await db.exec(`CREATE FUNCTION test_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture write failure'; END $$;
        CREATE TRIGGER test_fail_write BEFORE INSERT ON shoe_discount_details FOR EACH ROW EXECUTE FUNCTION test_fail_write();`);
      await asUser(ids.employee, () => assert.rejects(() => submit('DISCOUNT',discount), /Fixture write failure/));
      assert.equal(Number(await scalar('SELECT count(*) FROM shoe_requests')),before);
      await db.exec('DROP TRIGGER test_fail_write ON shoe_discount_details');
      const p = await asUser(ids.employee, () => submit());
      await db.exec('CREATE TRIGGER test_fail_write BEFORE INSERT ON shoe_audit_logs FOR EACH ROW EXECUTE FUNCTION test_fail_write()');
      await asUser(ids.manager, () => assert.rejects(() => act(p.id), /Fixture write failure/));
      assert.equal(await scalar('SELECT status FROM shoe_requests WHERE id=$1',[p.id]),'PENDING_MANAGEMENT');
      await db.exec('DROP TRIGGER test_fail_write ON shoe_audit_logs; DROP FUNCTION test_fail_write()');
    });
    await t.test('sequence IDs continue safely beyond five digits', async () => {
      await db.exec("SELECT setval('shoe_purchase_request_seq',99999,true); SELECT setval('shoe_petty_cash_request_seq',99999,true)");
      await asUser(ids.employee, async () => {
        assert.match((await submit()).display_id, /-100000$/);
        assert.match((await cash()).request_number, /-100000$/);
      });
    });
    await t.test('Admin promotion grants the same management workflow for all request types; demotion removes it', async () => {
      for (const role of ['NARENDRA','SANJEEV']) {
        await asUser(ids.admin, () => db.query('UPDATE shoe_profiles SET role=$1 WHERE id=$2',[role,ids.legacy]));
        const purchaseRequest = await asUser(ids.employee, () => submit());
        const discountRequest = await asUser(ids.employee, () => submit('DISCOUNT',discount));
        const pettyCashRequest = await asUser(ids.employee, cash);
        await asUser(ids.legacy, async () => {
          assert.equal(await scalar('SELECT shoe_is_management()'),true);
          assert.equal((await act(purchaseRequest.id)).status,'FINAL_APPROVED');
          assert.equal((await act(discountRequest.id)).status,'FINAL_APPROVED');
          assert.equal((await actCash(pettyCashRequest.id)).status,'APPROVED');
        });
        await asUser(ids.admin, () => db.query("UPDATE shoe_profiles SET role='REQUESTER' WHERE id=$1",[ids.legacy]));
        const pending = await asUser(ids.employee, () => submit());
        const pendingCash = await asUser(ids.employee, cash);
        await asUser(ids.legacy, async () => {
          assert.equal(await scalar('SELECT shoe_is_management()'),false);
          await assert.rejects(() => act(pending.id), /Only management/);
          await assert.rejects(() => actCash(pendingCash.id), /not authorised/);
        });
      }
    });
    await t.test('role selectors expose only Requester, Management and Admin while retaining existing management access', () => {
      assert.deepEqual(USER_ROLE_OPTIONS.map((role) => role.label), ['Requester','Management','Admin']);
      for (const role of ['NARENDRA','SANJEEV']) {
        assert.equal(getRoleOptionValue(role),'NARENDRA');
        assert.equal(getRoleLabel(role),'Management');
        assert.equal(isManagement(getRoleOptionValue(role)),true);
      }
      assert.equal(getRoleLabel('ADMIN'),'Admin');
      assert.equal(getRoleLabel('REQUESTER'),'Requester');
    });
    await t.test('directory emails are backfilled from Auth, populated on creation and kept in sync', async () => {
      assert.equal(await scalar('SELECT email FROM shoe_profiles WHERE id=$1',[ids.manager]),'manager@example.test');
      const created = await asUser(ids.admin, () => scalar("SELECT shoe_admin_create_user('EmailTest@example.test','TestPass1!','Email Test','EMAIL-TEST','Sales','Main','REQUESTER')"));
      assert.equal(await scalar('SELECT email FROM shoe_profiles WHERE id=$1',[created.id]),'emailtest@example.test');
      await db.query("UPDATE auth.users SET email='Changed@example.test' WHERE id=$1",[created.id]);
      assert.equal(await scalar('SELECT email FROM shoe_profiles WHERE id=$1',[created.id]),'changed@example.test');
      await asUser(ids.admin, () => db.query("UPDATE shoe_profiles SET email='incorrect@example.test' WHERE id=$1",[created.id]));
      assert.equal(await scalar('SELECT email FROM shoe_profiles WHERE id=$1',[created.id]),'changed@example.test');
      await asUser(ids.admin, () => db.query('SELECT shoe_admin_delete_user($1)',[created.id]));
    });
    await t.test('Admin edits all user fields and login credentials atomically; other roles cannot', async () => {
      const created = await asUser(ids.admin, () => scalar("SELECT shoe_admin_create_user('editable@example.test','BeforePass1!','Edit User','EDIT-TEST','Sales','Main','REQUESTER')"));
      const update = (email='edited@example.test',code='EDIT-UPDATED',password='AfterPass1!') => scalar(
        "SELECT to_jsonb(shoe_admin_update_user($1,$2,'Updated Name',$3,'Accounts','New Branch','NARENDRA',$4))",[created.id,email,code,password]);
      await asUser(ids.employee, () => assert.rejects(() => update(), /Only administrators/));
      const updated = await asUser(ids.admin, () => update());
      assert.equal(updated.full_name,'Updated Name'); assert.equal(updated.email,'edited@example.test');
      assert.equal(updated.employee_code,'EDIT-UPDATED'); assert.equal(updated.department,'Accounts');
      assert.equal(updated.showroom_location,'New Branch'); assert.equal(updated.role,'NARENDRA');
      assert.equal(await scalar("SELECT encrypted_password = extensions.crypt('AfterPass1!',encrypted_password) FROM auth.users WHERE id=$1",[created.id]),true);
      assert.equal(await scalar("SELECT identity_data->>'email' FROM auth.identities WHERE user_id=$1",[created.id]),'edited@example.test');
      const passwordBefore = await scalar('SELECT encrypted_password FROM auth.users WHERE id=$1',[created.id]);
      await asUser(ids.admin, () => update('edited@example.test','EDIT-UPDATED',null));
      assert.equal(await scalar('SELECT encrypted_password FROM auth.users WHERE id=$1',[created.id]),passwordBefore);
      await asUser(ids.admin, () => assert.rejects(() => update('employee@example.test'), /already used/));
      await asUser(ids.admin, () => assert.rejects(() => update('rollback@example.test','employee'), /unique/));
      assert.equal(await scalar('SELECT email FROM auth.users WHERE id=$1',[created.id]),'edited@example.test');
      await asUser(ids.admin, () => assert.rejects(() => scalar("SELECT shoe_admin_update_user($1,'admin@example.test','Admin','admin','Sales','Main','REQUESTER')",[ids.admin]), /own administrator/));
      await asUser(ids.admin, () => db.query('SELECT shoe_admin_delete_user($1)',[created.id]));
    });
    await t.test('unapproved legacy request is requeued and payment requires approval evidence', async () => {
      const r = await scalar("SELECT to_jsonb(r) FROM shoe_petty_cash_requests r WHERE request_number='PC-2026-00030'");
      assert.equal(r.status,'PENDING_MANAGEMENT'); assert.equal(r.approved_amount,null);
      await asUser(ids.admin, () => db.query("UPDATE shoe_petty_cash_requests SET status='APPROVED',current_stage='PAYMENT',approved_amount=5000 WHERE id=$1",[r.id]));
      await asUser(ids.manager, () => assert.rejects(() => pay(r.id,1), /recorded management approval/));
      assert.equal(hasRecordedApproval([]),false);
      assert.equal(hasRecordedApproval([{decision:'APPROVED',created_at:'2026-10-20T00:00:00Z'},{decision:'SUBMITTED',created_at:'2026-10-21T00:00:00Z'}]),false);
      assert.equal(hasRecordedApproval([{decision:'SUBMITTED',created_at:'2026-10-20T00:00:00Z'},{decision:'APPROVED',created_at:'2026-10-21T00:00:00Z'}]),true);
    });
    await t.test('client permissions match the management roles and self-approval rules', () => {
      for (const role of ['REQUESTER','L1_APPROVER','L2_APPROVER','ACCOUNT',null]) assert.equal(isManagement(role),false);
      for (const role of ['ADMIN','NARENDRA','SANJEEV']) assert.equal(isManagement(role),true);
      assert.equal(canApproveRequest('NARENDRA',ids.employee,ids.manager),true);
      assert.equal(canApproveRequest('NARENDRA',ids.manager,ids.manager),false);
      assert.equal(canApproveRequest('ADMIN',ids.admin,ids.admin),true);
      assert.equal(canApproveRequest('ADMIN',ids.employee,null),false);
    });
  } finally { await db.close(); }
});
