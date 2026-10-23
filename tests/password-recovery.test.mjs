import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestRecoveryLink, updateListedUserPassword, changeOwnPassword, recoveryLinkError } from '../src/lib/passwordRecovery.ts';
const profile={id:'listed-user',role:'REQUESTER'};
const calls=[];
const fakeAuth=(overrides={})=>({
  resetPasswordForEmail:async(...args)=>{calls.push(['recover',...args]);return{error:null};},
  updateUser:async(args)=>{calls.push(['update',args]);return{error:null};},
  getUser:async()=>({data:{user:{id:profile.id,email:'current@example.test'}},error:null}),
  signInWithPassword:async(args)=>{calls.push(['verify',args]);return{data:{user:{id:profile.id}},error:null};},
  ...overrides,
});
test('reset request normalizes the address and uses the password-reset route',async()=>{
  calls.length=0;await requestRecoveryLink(fakeAuth(),' User@Example.test ','https://shoe-approval-system-hopz.vercel.app/login');
  assert.deepEqual(calls,[['recover','user@example.test',{redirectTo:'https://shoe-approval-system-hopz.vercel.app/update-password'}]]);
});
test('invalid email never invokes the provider; provider errors are reported',async()=>{
  calls.length=0;await assert.rejects(()=>requestRecoveryLink(fakeAuth(),'invalid','https://example.test'),/valid email/);assert.equal(calls.length,0);
  await assert.rejects(()=>requestRecoveryLink(fakeAuth({resetPasswordForEmail:async()=>({error:{message:'Email rate limit exceeded'}})}),'user@example.test','https://example.test'),/rate limit/);
});
test('password update requires matching passwords, policy compliance and the listed user session',async()=>{
  calls.length=0;
  await assert.rejects(()=>updateListedUserPassword(fakeAuth(),null,null,'NewPass1!','NewPass1!'),/session/);
  await assert.rejects(()=>updateListedUserPassword(fakeAuth(),'someone-else',profile,'NewPass1!','NewPass1!'),/session/);
  await assert.rejects(()=>updateListedUserPassword(fakeAuth(),profile.id,profile,'NewPass1!','different'),/match/);
  await assert.rejects(()=>updateListedUserPassword(fakeAuth(),profile.id,profile,'weak','weak'),/6 characters/);
  assert.equal(calls.length,0);
  await updateListedUserPassword(fakeAuth(),profile.id,profile,'NewPass1!','NewPass1!');assert.deepEqual(calls,[['update',{password:'NewPass1!'}]]);
});
test('expired recovery URLs display an error without treating URL text as credentials',()=>{
  assert.match(recoveryLinkError('#error=access_denied&error_code=otp_expired',''),/expired/);
  assert.match(recoveryLinkError('','?error=access_denied'),/expired/);
  assert.equal(recoveryLinkError('#type=recovery',''),null);
});
test('own password change verifies the current identity/password before updating',async()=>{
  calls.length=0;await changeOwnPassword(fakeAuth(),profile.id,profile,'OldPass1!','NewPass1!','NewPass1!');
  assert.deepEqual(calls,[['verify',{email:'current@example.test',password:'OldPass1!'}],['update',{password:'NewPass1!'}]]);
});
test('wrong current password or another account cannot cause a password update',async()=>{
  calls.length=0;
  await assert.rejects(()=>changeOwnPassword(fakeAuth({signInWithPassword:async()=>({data:{user:null},error:{message:'Invalid login'}})}),profile.id,profile,'WrongPass1!','NewPass1!','NewPass1!'),/Current password/);
  await assert.rejects(()=>changeOwnPassword(fakeAuth({getUser:async()=>({data:{user:{id:'other',email:'other@example.test'}},error:null})}),profile.id,profile,'OldPass1!','NewPass1!','NewPass1!'),/session/);
  await assert.rejects(()=>changeOwnPassword(fakeAuth({signInWithPassword:async()=>({data:{user:{id:'other'}},error:null})}),profile.id,profile,'OldPass1!','NewPass1!','NewPass1!'),/Current password/);
  assert.equal(calls.filter(([type])=>type==='update').length,0);
});
test('missing current password and reusing it are rejected before authentication',async()=>{
  calls.length=0;
  await assert.rejects(()=>changeOwnPassword(fakeAuth(),profile.id,profile,'','NewPass1!','NewPass1!'),/current password/);
  await assert.rejects(()=>changeOwnPassword(fakeAuth(),profile.id,profile,'SamePass1!','SamePass1!','SamePass1!'),/different/);
  assert.equal(calls.length,0);
});
