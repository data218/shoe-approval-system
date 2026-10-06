import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Activity, Clock, CheckCircle, XCircle, Package, Tag, ArrowRight, Eye, MessageSquare, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ l1Pending: 0, l2Pending: 0, approvedToday: 0, rejected: 0, totalValue: 0 });
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [details, setDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      fetchDashboardData();
    }
  }, [profile]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Recent Requests
      let query = supabase
        .from('shoe_requests')
        .select(`
          *, 
          requester:shoe_profiles!requester_id(full_name, department), 
          audit_logs:shoe_audit_logs(remarks, action),
          purchase_details:shoe_purchase_details(item_name),
          discount_details:shoe_discount_details(product_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      // Apply role-based filtering for the dashboard views
      if (profile?.role === 'L1_APPROVER') {
        query = query.in('status', ['PENDING_L1', 'FINAL_APPROVED', 'REJECTED']);
      } else if (profile?.role === 'L2_APPROVER') {
        query = query.in('status', ['PENDING_L2', 'FINAL_APPROVED', 'REJECTED']);
      } else if (profile?.role === 'REQUESTER') {
        query = query.eq('requester_id', profile.id);
      }
      // ADMIN sees everything

      const { data: reqs, error: reqError } = await query;
      if (reqError) throw reqError;

      // Ensure audit_logs is sorted so we grab the latest remark
      const formattedReqs = (reqs || []).map(r => {
        let lastRemark = null;
        if (r.audit_logs && r.audit_logs.length > 0) {
          lastRemark = r.audit_logs[r.audit_logs.length - 1].remarks;
        }
        
        let itemName = '-';
        if (r.type === 'PURCHASE' && r.purchase_details && r.purchase_details.length > 0) {
          itemName = r.purchase_details[0].item_name;
        } else if (r.type === 'DISCOUNT' && r.discount_details && r.discount_details.length > 0) {
          itemName = r.discount_details[0].product_name;
        }

        return { ...r, lastRemark, itemName };
      });
      setRecentRequests(formattedReqs);

      // 2. Fetch Stats
      // For stats, we need all requests visible to the user
      let statsQuery = supabase.from('shoe_requests').select('*');
      if (profile?.role === 'REQUESTER') {
        statsQuery = statsQuery.eq('requester_id', profile.id);
      }
      
      const { data: allReqs, error: statsError } = await statsQuery;
      if (statsError) throw statsError;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let l1Pending = 0;
      let l2Pending = 0;
      let approvedToday = 0;
      let rejected = 0;
      
      (allReqs || []).forEach(r => {
        if (r.status === 'PENDING_L1') l1Pending++;
        if (r.status === 'PENDING_L2') l2Pending++;
        if (r.status === 'REJECTED') rejected++;
        
        if (r.status === 'FINAL_APPROVED') {
          const reqDate = new Date(r.updated_at);
          if (reqDate >= today) approvedToday++;
        }
      });

      // 3. Calculate Total Value (We need to fetch the details for approved requests)
      let totalVal = 0;
      const approvedIds = (allReqs || []).filter(r => r.status === 'FINAL_APPROVED').map(r => r.id);
      
      if (approvedIds.length > 0) {
        const { data: purData } = await supabase.from('shoe_purchase_details').select('total_amount').in('request_id', approvedIds);
        const { data: disData } = await supabase.from('shoe_discount_details').select('final_price').in('request_id', approvedIds);
        
        purData?.forEach(p => totalVal += parseFloat(p.total_amount || '0'));
        disData?.forEach(d => totalVal += parseFloat(d.final_price || '0'));
      }

      setStats({ l1Pending, l2Pending, approvedToday, rejected, totalValue: totalVal });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRequest = async (req: any) => {
    setSelectedRequest(req);
    setDetails(null);
    
    try {
      setDetailsLoading(true);
      const table = req.type === 'PURCHASE' ? 'shoe_purchase_details' : 'shoe_discount_details';
      const { data, error: detailError } = await supabase
        .from(table)
        .select('*')
        .eq('request_id', req.id)
        .single();
        
      if (detailError) throw detailError;
      
      setDetails(data);
    } catch (err: any) {
      console.error(err);
      alert('Failed to fetch request details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const getL1Badge = (status: string) => {
    if (status === 'PENDING_L1') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pending</span>;
    if (['PENDING_L2', 'FINAL_APPROVED'].includes(status)) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Approved</span>;
    if (status === 'REJECTED') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">Rejected</span>;
    if (status === 'SENT_BACK') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">Sent Back</span>;
    return <span className="text-slate-300">-</span>;
  };

  const getL2Badge = (status: string) => {
    if (status === 'PENDING_L1') return <span className="text-slate-300">-</span>;
    if (status === 'PENDING_L2') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Pending</span>;
    if (status === 'FINAL_APPROVED') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Approved</span>;
    if (status === 'REJECTED') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">Rejected</span>;
    if (status === 'SENT_BACK') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">Sent Back</span>;
    return <span className="text-slate-300">-</span>;
  };

  const getPriorityBadge = (priority: string) => {
    const isUrgent = priority === 'URGENT' || priority === 'CRITICAL';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isUrgent ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
        {priority}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('en-GB', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    return `${day} ${month}'${year}`;
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-slate-500 mt-1">Welcome back, {profile?.full_name}</p>
        </div>
        <button onClick={() => navigate('/dashboard/new')} className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2">
          New Request <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-slate-200 rounded-2xl"></div>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {/* L1 Pending Card */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-100 p-6 rounded-2xl shadow-sm border border-amber-200 hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-200/50 rounded-full blur-2xl group-hover:bg-amber-300/50 transition-colors"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-sm font-bold text-amber-800 uppercase tracking-wider">L1 Pending</p>
                <h3 className="text-3xl font-black text-amber-950 mt-2">{stats.l1Pending}</h3>
              </div>
              <div className="w-14 h-14 bg-white/60 rounded-2xl flex items-center justify-center rotate-3 shadow-sm">
                <Clock className="w-7 h-7 text-amber-600" />
              </div>
            </div>
          </div>

          {/* L2 Pending Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-6 rounded-2xl shadow-sm border border-blue-200 hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-200/50 rounded-full blur-2xl group-hover:bg-blue-300/50 transition-colors"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-sm font-bold text-blue-800 uppercase tracking-wider">L2 Pending</p>
                <h3 className="text-3xl font-black text-blue-950 mt-2">{stats.l2Pending}</h3>
              </div>
              <div className="w-14 h-14 bg-white/60 rounded-2xl flex items-center justify-center rotate-3 shadow-sm">
                <Clock className="w-7 h-7 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Approved Card */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-100 p-6 rounded-2xl shadow-sm border border-emerald-200 hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-200/50 rounded-full blur-2xl group-hover:bg-emerald-300/50 transition-colors"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Approved Today</p>
                <h3 className="text-3xl font-black text-emerald-950 mt-2">{stats.approvedToday}</h3>
              </div>
              <div className="w-14 h-14 bg-white/60 rounded-2xl flex items-center justify-center -rotate-3 shadow-sm">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
              </div>
            </div>
          </div>

          {/* Rejected Card */}
          <div className="bg-gradient-to-br from-rose-50 to-red-100 p-6 rounded-2xl shadow-sm border border-rose-200 hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-rose-200/50 rounded-full blur-2xl group-hover:bg-rose-300/50 transition-colors"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-sm font-bold text-rose-800 uppercase tracking-wider">Rejected</p>
                <h3 className="text-3xl font-black text-rose-950 mt-2">{stats.rejected}</h3>
              </div>
              <div className="w-14 h-14 bg-white/60 rounded-2xl flex items-center justify-center rotate-3 shadow-sm">
                <XCircle className="w-7 h-7 text-rose-600" />
              </div>
            </div>
          </div>

          {/* Total Value Card */}
          <div className="bg-gradient-to-tr from-indigo-900 to-slate-900 p-6 rounded-2xl shadow-lg border border-slate-800 text-white hover:shadow-xl transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Activity className="w-24 h-24" />
            </div>
            <div className="relative z-10 flex flex-col justify-between h-full">
              <div>
                <p className="text-sm font-bold text-indigo-300 uppercase tracking-wider">Total Approved Value</p>
                <h3 className="text-3xl font-black mt-2 text-emerald-400">₹{stats.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Table */}
      <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
          <button onClick={() => navigate('/dashboard/inbox')} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
            View All Inbox
          </button>
        </div>
        
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading activity...</div>
        ) : recentRequests.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-slate-500">
            <Activity className="w-12 h-12 text-slate-200 mb-4" />
            <p className="text-lg font-medium text-slate-700">No requests yet</p>
            <p className="text-sm">When requests are submitted, they will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs uppercase tracking-wider font-bold">
                  <th className="px-6 py-4 rounded-tl-lg">Date</th>
                  <th className="px-6 py-4">Request ID</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Item Name</th>
                  <th className="px-6 py-4">Requester</th>
                  <th className="px-6 py-4 text-center">L1 Status</th>
                  <th className="px-6 py-4 text-center">L2 Status</th>
                  <th className="px-6 py-4 max-w-[200px]">Latest Remarks</th>
                  <th className="px-6 py-4 text-right rounded-tr-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRequests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 text-sm text-slate-500 font-medium whitespace-nowrap">
                      {formatDate(req.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{req.display_id}</span>
                        {getPriorityBadge(req.priority)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-700 font-medium whitespace-nowrap">
                        {req.type === 'PURCHASE' ? <Package className="w-4 h-4 text-slate-400" /> : <Tag className="w-4 h-4 text-slate-400" />}
                        {req.type === 'PURCHASE' ? 'Goods' : 'Discount'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-slate-800 max-w-[150px] truncate" title={req.itemName}>
                        {req.itemName}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-slate-800">{req.requester?.full_name}</div>
                      <div className="text-xs text-slate-500">{req.requester?.department}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getL1Badge(req.status)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getL2Badge(req.status)}
                    </td>
                    <td className="px-6 py-4 max-w-[200px] truncate">
                      {req.lastRemark ? (
                        <span className="text-sm text-slate-600 italic border-l-2 border-slate-300 pl-2" title={req.lastRemark}>
                          "{req.lastRemark}"
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleSelectRequest(req)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-xl font-bold text-slate-900">{selectedRequest.display_id}</h3>
                  {getPriorityBadge(selectedRequest.priority)}
                </div>
                <div className="flex gap-2 mt-2">
                  <div className="text-sm font-semibold text-slate-500 flex items-center gap-2">L1: {getL1Badge(selectedRequest.status)}</div>
                  <div className="text-sm font-semibold text-slate-500 flex items-center gap-2">L2: {getL2Badge(selectedRequest.status)}</div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedRequest(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-200 transition-colors self-start"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {detailsLoading ? (
                <div className="flex justify-center p-12 text-slate-400"><Activity className="w-8 h-8 animate-spin" /></div>
              ) : details ? (
                <>
                  {selectedRequest.image_url && (
                    <div className="bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                      <a href={selectedRequest.image_url} target="_blank" rel="noreferrer">
                        <img 
                          src={selectedRequest.image_url} 
                          alt="Attached product" 
                          className="w-full h-48 object-cover hover:opacity-90 transition-opacity" 
                        />
                      </a>
                    </div>
                  )}

                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> Business Justification
                    </h3>
                    <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{selectedRequest.reason}</p>
                  </div>

                  {selectedRequest.type === 'PURCHASE' ? (
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-4 border-b pb-2">Purchase Details</h3>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div><dt className="text-slate-500">Supplier</dt><dd className="font-medium text-slate-900">{details.supplier}</dd></div>
                        <div><dt className="text-slate-500">Item Category</dt><dd className="font-medium text-slate-900">{details.item_category}</dd></div>
                        <div><dt className="text-slate-500">Item Name</dt><dd className="font-medium text-slate-900">{details.item_name}</dd></div>
                        <div><dt className="text-slate-500">SKU</dt><dd className="font-medium text-slate-900">{details.sku}</dd></div>
                        <div><dt className="text-slate-500">Quantity</dt><dd className="font-medium text-slate-900">{details.quantity}</dd></div>
                        <div><dt className="text-slate-500">Unit Price</dt><dd className="font-medium text-slate-900">₹{parseFloat(details.unit_price).toFixed(2)}</dd></div>
                      </dl>
                      <div className="mt-6 bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center">
                        <span className="font-medium">Total Amount Request</span>
                        <span className="text-2xl font-bold">₹{parseFloat(details.total_amount).toFixed(2)}</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-4 border-b pb-2">Discount Details</h3>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div><dt className="text-slate-500">Customer Name</dt><dd className="font-medium text-slate-900">{details.customer_name}</dd></div>
                        <div><dt className="text-slate-500">Mobile</dt><dd className="font-medium text-slate-900">{details.customer_mobile}</dd></div>
                        <div className="sm:col-span-2"><dt className="text-slate-500">Product</dt><dd className="font-medium text-slate-900">{details.brand} {details.product_name} (SKU: {details.sku})</dd></div>
                        <div><dt className="text-slate-500">Original Price</dt><dd className="font-medium text-slate-900 line-through text-slate-400">₹{parseFloat(details.original_price).toFixed(2)}</dd></div>
                        <div><dt className="text-slate-500">Discount Requested</dt><dd className="font-medium text-emerald-600">₹{parseFloat(details.discount_amount).toFixed(2)} ({parseFloat(details.discount_percentage).toFixed(1)}%)</dd></div>
                      </dl>
                      <div className="mt-6 bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center">
                        <span className="font-medium">Final Price to Customer</span>
                        <span className="text-2xl font-bold">₹{parseFloat(details.final_price).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-slate-500">Could not load details.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
