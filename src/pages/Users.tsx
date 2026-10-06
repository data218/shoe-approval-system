import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Shield, ShieldAlert, ShieldCheck, Users as UsersIcon, UserCheck, Search, AlertCircle, RefreshCw, Pencil, Trash2, X } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Pagination } from '../components/Pagination';

export default function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [updateLoading, setUpdateLoading] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Edit Modal State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', employee_code: '', department: '' });
  const [editLoading, setEditLoading] = useState(false);

  if (profile && profile.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  useEffect(() => {
    if (profile?.role === 'ADMIN') {
      fetchUsers();
    }
  }, [profile]);

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
      const { error } = await supabase
        .from('shoe_profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      console.error(err);
      alert('Failed to update role. Ensure you have the proper RLS policies.');
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
        .from('shoe_profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;
      
      setUsers(users.filter(u => u.id !== userId));
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete user. Ensure you have the proper Admin Delete RLS policies.');
    } finally {
      setUpdateLoading(null);
    }
  };

  const openEditModal = (user: any) => {
    setEditingUser(user);
    setEditForm({
      full_name: user.full_name || '',
      employee_code: user.employee_code || '',
      department: user.department || ''
    });
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    
    try {
      setEditLoading(true);
      const { error } = await supabase
        .from('shoe_profiles')
        .update({
          full_name: editForm.full_name,
          employee_code: editForm.employee_code,
          department: editForm.department
        })
        .eq('id', editingUser.id);

      if (error) throw error;
      
      setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...editForm } : u));
      setEditingUser(null);
    } catch (err: any) {
      console.error(err);
      alert('Failed to save edits. Ensure you have the proper Admin RLS policies.');
    } finally {
      setEditLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const nameStr = String(u.full_name || '').toLowerCase();
    const codeStr = String(u.employee_code || '').toLowerCase();
    const searchStr = (searchTerm || '').toLowerCase();
    return nameStr.includes(searchStr) || codeStr.includes(searchStr);
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-1 rounded-md text-xs font-bold border border-purple-200"><ShieldAlert className="w-3 h-3" /> Admin</span>;
      case 'L1_APPROVER': return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded-md text-xs font-bold border border-amber-200"><Shield className="w-3 h-3" /> Level 1</span>;
      case 'L2_APPROVER': return <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-bold border border-blue-200"><ShieldCheck className="w-3 h-3" /> Level 2</span>;
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
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
            <UsersIcon className="w-5 h-5 text-slate-400" />
            {filteredUsers.length} Users Found
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold border-b border-slate-200">
                <th className="px-6 py-4">Employee</th>
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
                          value={u.role || 'REQUESTER'}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          disabled={updateLoading === u.id}
                          className="pl-3 pr-8 py-1.5 border border-slate-300 rounded-lg text-sm bg-white hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50 appearance-none font-medium text-slate-700"
                        >
                          <option value="REQUESTER">Requester</option>
                          <option value="L1_APPROVER">Level 1 Approver</option>
                          <option value="L2_APPROVER">Level 2 Approver</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        {updateLoading === u.id && (
                          <RefreshCw className="w-4 h-4 text-brand-500 animate-spin absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {u.id !== profile?.id && (
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id, u.full_name)}
                          disabled={updateLoading === u.id}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete User"
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
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
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

      {/* Edit Modal Overlay */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">Edit Profile</h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input 
                  type="text"
                  value={editForm.full_name}
                  onChange={e => setEditForm({...editForm, full_name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee Code</label>
                <input 
                  type="text"
                  value={editForm.employee_code}
                  onChange={e => setEditForm({...editForm, employee_code: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                <input 
                  type="text"
                  value={editForm.department}
                  onChange={e => setEditForm({...editForm, department: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editLoading}
                className="px-4 py-2 bg-brand-600 text-white font-medium hover:bg-brand-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {editLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
