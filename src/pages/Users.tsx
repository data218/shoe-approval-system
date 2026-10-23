import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert, Users as UsersIcon, UserCheck, Search, AlertCircle, RefreshCw, Pencil, Trash2, X, Key, Plus, Eye, EyeOff } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { USER_ROLE_OPTIONS, getRoleOptionValue, getRoleLabel } from '../lib/approvals';
import { Pagination } from '../components/Pagination';

export default function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleMessage, setRoleMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [updateLoading, setUpdateLoading] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Edit Modal State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ email: '', full_name: '', employee_code: '', department: '', showroom_location: '', role: 'REQUESTER', password: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Reset Password Modal State
  const [resetModalUser, setResetModalUser] = useState<any | null>(null);
  const [resetModalEmail, setResetModalEmail] = useState('');

  // Create User Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    full_name: '',
    employee_code: '',
    department: '',
    role: 'REQUESTER' as any
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  useEffect(() => {
    if (profile?.role === 'ADMIN') {
      fetchUsers();
    }
  }, [profile]);

  if (profile && profile.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('shoe_profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch users.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      setUpdateLoading(userId);
      setError(null);
      setRoleMessage(null);
      const { data, error } = await supabase
        .from('shoe_profiles')
        .update({ role: newRole })
        .eq('id', userId)
        .select('id, role')
        .single();

      if (error) throw error;
      
      setUsers((previous) => previous.map(u => u.id === userId ? { ...u, role: data.role } : u));
      setRoleMessage(`Role updated to ${getRoleLabel(data.role)}.`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Unable to update the role. Please try again.');
    } finally {
      setUpdateLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to completely remove ${userName} from the system? This cannot be undone.`)) {
      return;
    }
    
    try {
      setUpdateLoading(userId);
      const { error } = await supabase
        .rpc('shoe_admin_delete_user', { p_user_id: userId });

      if (error) throw error;
      
      setUsers(users.filter(u => u.id !== userId));
    } catch (err: any) {
      console.error(err);
      alert('Failed to remove user: ' + (err.message || 'Unknown error'));
    } finally {
      setUpdateLoading(null);
    }
  };

  const handleAdminResetPassword = async () => {
    if (!resetModalEmail || !resetModalUser) return;

    try {
      setUpdateLoading(resetModalUser.id);
      const { error } = await supabase.auth.resetPasswordForEmail(resetModalEmail, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;
      alert(`Password reset link sent to ${resetModalEmail}`);
      setResetModalUser(null);
      setResetModalEmail('');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to send password reset email.');
    } finally {
      setUpdateLoading(null);
    }
  };

  const openEditModal = (user: any) => {
    setEditingUser(user);
    setEditError(null);
    setEditForm({
      email: user.email || '',
      full_name: user.full_name || '',
      employee_code: user.employee_code || '',
      department: user.department || '',
      showroom_location: user.showroom_location || '',
      role: getRoleOptionValue(user.role),
      password: ''
    });
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    
    if (!editForm.full_name.trim() || !editForm.employee_code.trim()) {
      setEditError('Full name and employee code are required.');
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      setEditError('New password must be at least 6 characters.');
      return;
    }
    try {
      setEditLoading(true);
      setEditError(null);
      const { data, error } = await supabase.rpc('shoe_admin_update_user', {
        p_user_id: editingUser.id,
        p_email: editForm.email.trim(),
        p_full_name: editForm.full_name.trim(),
        p_employee_code: editForm.employee_code.trim(),
        p_department: editForm.department.trim(),
        p_showroom_location: editForm.showroom_location.trim(),
        p_role: editForm.role,
        p_password: editForm.password || null,
      });
      let saved = data;
      if (error?.code === 'PGRST202') {
        // Preserve existing profile editing until the new RPC is installed.
        const emailChanged = editForm.email.trim().toLowerCase() !== String(editingUser.email || '').trim().toLowerCase();
        if (emailChanged || editForm.password) {
          throw new Error('Email and password editing needs the account-editing update before changes can be saved. Other profile fields can still be edited.');
        }
        const result = await supabase.from('shoe_profiles').update({
          full_name: editForm.full_name.trim(), employee_code: editForm.employee_code.trim(),
          department: editForm.department.trim(), showroom_location: editForm.showroom_location.trim(),
          role: editForm.role,
        }).eq('id', editingUser.id).select('*').single();
        if (result.error) throw result.error;
        saved = result.data;
      } else if (error) throw error;
      setUsers((previous) => previous.map(u => u.id === editingUser.id ? saved : u));
      setEditingUser(null);
      setEditForm({ email: '', full_name: '', employee_code: '', department: '', showroom_location: '', role: 'REQUESTER', password: '' });
      setRoleMessage('User details updated successfully.');
    } catch (err: any) {
      setEditError(err.message || 'Unable to save user details. Please try again.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    try {
      // Create the auth user + profile server-side via a SECURITY DEFINER
      // SQL RPC (shoe_admin_create_user). It also heals accounts that already
      // exist in auth.users but have no profile row.
      const { data, error: rpcError } = await supabase.rpc('shoe_admin_create_user', {
        p_email: createForm.email,
        p_password: createForm.password,
        p_full_name: createForm.full_name,
        p_employee_code: createForm.employee_code,
        p_department: createForm.department || 'Sales',
        p_showroom_location: 'Main Branch',
        p_role: createForm.role,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }
      if ((data as any)?.error) {
        throw new Error((data as any).error);
      }

      // Persist the login email for the admin directory on older databases too.
      const { error: emailError } = await supabase.from('shoe_profiles')
        .update({ email: String((data as any).email || createForm.email).trim().toLowerCase() })
        .eq('id', (data as any).id);
      if (emailError) {
        setError('The user was created, but their email could not be added to the directory. Please apply the email sync migration.');
      }

      // Success! Refresh users list
      await fetchUsers();
      setCreateModalOpen(false);
      setShowCreatePassword(false);
      setCreateForm({ email: '', password: '', full_name: '', employee_code: '', department: '', role: 'REQUESTER' });
    } catch (err: any) {
      console.error(err);
      setCreateError(err.message || 'Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const nameStr = String(u.full_name || '').toLowerCase();
    const codeStr = String(u.employee_code || '').toLowerCase();
    const emailStr = String(u.email || '').toLowerCase();
    const searchStr = (searchTerm || '').trim().toLowerCase();
    return nameStr.includes(searchStr) || codeStr.includes(searchStr) || emailStr.includes(searchStr);
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-1 rounded-md text-xs font-bold border border-purple-200"><ShieldAlert className="w-3 h-3" /> Admin</span>;
      case 'NARENDRA':
      case 'SANJEEV': return <span className="text-sm font-semibold text-brand-700">Management</span>;
      default: return <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-bold border border-slate-200"><UserCheck className="w-3 h-3" /> Requester</span>;
    }
  };

  if (loading) {
    return <div className="p-12 flex justify-center text-slate-400"><RefreshCw className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500 relative">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">User Management</h1>
        <p className="text-slate-500 mt-1">Manage employee roles, edit profiles, and control system access.</p>
      </div>

      {roleMessage && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {roleMessage}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div className="relative w-full max-w-sm">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Search name, email or employee code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
              <UsersIcon className="w-5 h-5 text-slate-400" />
              {filteredUsers.length} Users Found
            </div>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create User
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold border-b border-slate-200">
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Email ID</th>
                <th className="px-6 py-4">Code</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Current Role</th>
                <th className="px-6 py-4">Change Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">{u.full_name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {u.email ? <span className="break-all">{u.email}</span> : <span className="text-slate-400">Not available</span>}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-500">
                    {u.employee_code}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {u.department}
                  </td>
                  <td className="px-6 py-4">
                    {getRoleBadge(u.role)}
                  </td>
                  <td className="px-6 py-4">
                    {u.id === profile?.id ? (
                      <span className="text-xs text-slate-400 italic">Cannot edit own role</span>
                    ) : (
                      <div className="relative">
                        <select 
                          value={getRoleOptionValue(u.role)}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          disabled={updateLoading === u.id}
                          className="pl-3 pr-8 py-1.5 border border-slate-300 rounded-lg text-sm bg-white hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50 appearance-none font-medium text-slate-700"
                        >
                          {USER_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                        </select>
                        {updateLoading === u.id && (
                          <RefreshCw className="w-4 h-4 text-brand-500 animate-spin absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {u.id === profile?.id && (
                      <button onClick={() => openEditModal(u)} aria-label="Edit your profile" className="p-1.5 text-slate-400 hover:text-brand-600" title="Edit User"><Pencil className="h-4 w-4" /></button>
                    )}
                    {u.id !== profile?.id && (
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setResetModalUser(u)}
                          disabled={updateLoading === u.id}
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Reset Password"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id, u.full_name)}
                          disabled={updateLoading === u.id || u.id === profile?.id}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title={u.id === profile?.id ? "You cannot remove your own administrator account" : "Remove user and login access"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    No users found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredUsers.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        </div>
      </div>

      {/* Edit all employee fields; passwords are never read or displayed. */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={(event) => { event.preventDefault(); void saveEdit(); }} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <div><h3 className="text-lg font-bold text-slate-900">Edit User</h3><p className="mt-1 text-sm text-slate-500">Manage employee details, login access and role.</p></div>
              <button type="button" aria-label="Close edit user" disabled={editLoading} onClick={() => setEditingUser(null)} className="p-2 text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              {editError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{editError}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  ['email', 'Email ID', 'email'], ['full_name', 'Full Name', 'text'],
                  ['employee_code', 'Employee Code', 'text'], ['department', 'Department', 'text'],
                  ['showroom_location', 'Branch / Location', 'text'],
                ] as const).map(([field, label, type]) => (
                  <div key={field}>
                    <label htmlFor={`edit-${field}`} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                    <input id={`edit-${field}`} type={type} value={editForm[field]} disabled={editLoading}
                      required={['email','full_name','employee_code'].includes(field)}
                      onChange={(event) => setEditForm({ ...editForm, [field]: event.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-50" />
                  </div>
                ))}
                <div>
                  <label htmlFor="edit-role" className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select id="edit-role" value={editForm.role} disabled={editLoading || editingUser.id === profile?.id}
                    onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-50">
                    {USER_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {editingUser.id === profile?.id && <p className="mt-1 text-xs text-slate-500">Your administrator role is protected to prevent losing access.</p>}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <label htmlFor="edit-password" className="block text-sm font-medium text-slate-700 mb-1">New Password (optional)</label>
                <input id="edit-password" type="password" autoComplete="new-password" minLength={6} value={editForm.password} disabled={editLoading}
                  onChange={(event) => setEditForm({ ...editForm, password: event.target.value })}
                  placeholder="Leave blank to keep the current password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                <p className="mt-1 text-xs text-slate-500">Existing passwords are never displayed. Enter at least 6 characters to set a new password.</p>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button type="button" disabled={editLoading} onClick={() => setEditingUser(null)} className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg">Cancel</button>
              <button type="submit" disabled={editLoading} className="px-4 py-2 bg-brand-600 text-white font-medium hover:bg-brand-700 rounded-lg flex items-center gap-2 disabled:opacity-50">
                {editLoading && <RefreshCw className="w-4 h-4 animate-spin" />} {editLoading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Key className="w-4 h-4 text-brand-600" />
                Reset Password
              </h3>
              <button
                onClick={() => {
                  setResetModalUser(null);
                  setResetModalEmail('');
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 mb-4">
                Enter the email address for <span className="font-semibold">{resetModalUser.full_name}</span> to send them a secure password reset link.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">User's Email Address</label>
                <input
                  type="email"
                  value={resetModalEmail}
                  onChange={(e) => setResetModalEmail(e.target.value)}
                  placeholder="e.g. user@amgroupind.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setResetModalUser(null);
                  setResetModalEmail('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdminResetPassword}
                disabled={!resetModalEmail || updateLoading === resetModalUser.id}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {updateLoading === resetModalUser.id ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Key className="w-4 h-4" />
                )}
                Send Reset Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand-600" />
                Create New User
              </h3>
              <button 
                onClick={() => {
                  setCreateModalOpen(false);
                  setCreateError(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser}>
              <div className="p-6 space-y-4">
                {createError && (
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>{createError}</div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({...createForm, email: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showCreatePassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={createForm.password}
                      onChange={(e) => setCreateForm({...createForm, password: e.target.value})}
                      className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword(!showCreatePassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                      title={showCreatePassword ? 'Hide password' : 'Show password'}
                    >
                      {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={createForm.full_name}
                    onChange={(e) => setCreateForm({...createForm, full_name: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Employee Code</label>
                  <input
                    type="text"
                    required
                    value={createForm.employee_code}
                    onChange={(e) => setCreateForm({...createForm, employee_code: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({...createForm, role: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  >
                    {USER_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setCreateError(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {createLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
