import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Clock, 
  Package, 
  Tag,
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

import { Pagination } from '../components/Pagination';

export default function Inbox() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Selected request state
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [details, setDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      fetchRequests();
    } else {
      setError("Profile not found. Please ensure your employee profile is set up properly in the database.");
    }
  }, [profile]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('requests')
        .select(`
          *,
          requester:profiles!requester_id(full_name, employee_code, department),
          purchase_details(item_name, total_amount),
          discount_details(product_name, discount_amount)
        `)
        .order('created_at', { ascending: false });

      // Apply role-based filtering
      if (profile?.role === 'L1_APPROVER') {
        query = query.eq('status', 'PENDING_L1');
      } else if (profile?.role === 'L2_APPROVER') {
        query = query.eq('status', 'PENDING_L2');
      } else if (profile?.role === 'REQUESTER') {
        query = query.eq('requester_id', profile.id);
      }
      // ADMIN sees everything

      const { data, error: reqError } = await query;
      if (reqError) throw reqError;
      
      const formattedData = (data || []).map(r => {
        let itemName = '-';
        let amount = 0;
        if (r.type === 'PURCHASE' && r.purchase_details && r.purchase_details.length > 0) {
          itemName = r.purchase_details[0].item_name;
          amount = parseFloat(r.purchase_details[0].total_amount || '0');
        } else if (r.type === 'DISCOUNT' && r.discount_details && r.discount_details.length > 0) {
          itemName = r.discount_details[0].product_name;
          amount = parseFloat(r.discount_details[0].discount_amount || '0');
        }
        return { ...r, itemName, amount };
      });

      setRequests(formattedData);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch requests.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRequest = async (req: any) => {
    setSelectedRequest(req);
    setDetails(null);
    setRemarks('');
    
    try {
      setDetailsLoading(true);
      const table = req.type === 'PURCHASE' ? 'purchase_details' : 'discount_details';
      const { data, error: detailError } = await supabase
        .from(table)
        .select('*')
        .eq('request_id', req.id)
        .single();
        
      const { data: auditData } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('request_id', req.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (detailError) throw detailError;
      
      setDetails({
        ...data,
        latestRemark: auditData && auditData.length > 0 ? auditData[0] : null
      });
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch request details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string, classes: string, icon: any }> = {
      'PENDING_L1': { label: 'Pending L1', classes: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
      'PENDING_L2': { label: 'Pending L2', classes: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock },
      'FINAL_APPROVED': { label: 'Approved', classes: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle },
      'REJECTED': { label: 'Rejected', classes: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
      'SENT_BACK': { label: 'Sent Back', classes: 'bg-slate-100 text-slate-800 border-slate-200', icon: RefreshCw },
    };
    const mapped = map[status] || { label: status, classes: 'bg-slate-100 text-slate-800 border-slate-200', icon: AlertCircle };
    const Icon = mapped.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${mapped.classes}`}>
        <Icon className="w-3.5 h-3.5" />
        {mapped.label}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const map: Record<string, string> = {
      'NORMAL': 'bg-slate-100 text-slate-700 border-slate-200',
      'URGENT': 'bg-orange-100 text-orange-700 border-orange-200',
      'CRITICAL': 'bg-red-100 text-red-700 border-red-200',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[priority] || map['NORMAL']}`}>
        {priority}
      </span>
    );
  };

  const handleAction = async (actionType: 'APPROVE' | 'REJECT' | 'SEND_BACK') => {
    if (!remarks.trim() && actionType !== 'APPROVE') {
      alert('Remarks are mandatory for Reject and Send Back actions.');
      return;
    }
    
    setActionLoading(true);
    try {
      let newStatus = selectedRequest.status;
      
      if (actionType === 'APPROVE') {
        if (profile?.role === 'L1_APPROVER') newStatus = 'PENDING_L2';
        else if (profile?.role === 'L2_APPROVER' || profile?.role === 'ADMIN') newStatus = 'FINAL_APPROVED';
      } else if (actionType === 'REJECT') {
        newStatus = 'REJECTED';
      } else if (actionType === 'SEND_BACK') {
        newStatus = 'SENT_BACK';
      }

      // 1. Update Request
      const { error: updateError } = await supabase
        .from('requests')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selectedRequest.id);
        
      if (updateError) throw updateError;

      // 2. Insert Audit Log
      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert([{
          request_id: selectedRequest.id,
          user_id: user!.id,
          action: actionType,
          previous_status: selectedRequest.status,
          new_status: newStatus,
          remarks: remarks
        }]);

      if (auditError) throw auditError;

      // Reset and reload
      setSelectedRequest(null);
      fetchRequests();

    } catch (err: any) {
      console.error(err);
      alert('Action failed. See console.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-200 rounded w-1/4"></div>
      <div className="h-64 bg-slate-200 rounded-xl"></div>
    </div>;
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-lg font-bold text-red-800">Error Loading Inbox</h2>
          <p className="text-red-600 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 relative">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Approval Inbox</h1>
          <p className="mt-2 text-slate-600">Review and action pending requests.</p>
        </div>
        <button 
          onClick={fetchRequests}
          className="p-2 text-slate-400 hover:text-indigo-600 bg-white rounded-lg border border-slate-200 shadow-sm transition-colors"
          title="Refresh Inbox"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ShieldCheck className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p className="text-lg font-medium">All caught up!</p>
            <p className="text-sm">There are no pending requests for you to review.</p>
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
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Requester</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right rounded-tr-lg">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(req => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 text-sm text-slate-500 font-medium whitespace-nowrap">
                      {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{req.display_id}</span>
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
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">
                      ₹{(req.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-slate-800">{req.requester?.full_name}</div>
                      <div className="text-xs text-slate-500">{req.requester?.department}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(req.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleSelectRequest(req)}
                        className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ml-auto"
                      >
                        Review <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <Pagination
              currentPage={currentPage}
              totalItems={requests.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold text-slate-900">{selectedRequest.display_id}</h2>
                  {getPriorityBadge(selectedRequest.priority)}
                </div>
                <div>
                  {getStatusBadge(selectedRequest.status)}
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="text-right">
                  <p className="text-xs text-slate-500">Requested by</p>
                  <p className="font-semibold text-slate-900">{selectedRequest.requester?.full_name}</p>
                </div>
                <button 
                  onClick={() => setSelectedRequest(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors bg-white border border-slate-200"
                >
                  <AlertCircle className="w-5 h-5 hidden" /> {/* Hidden hack to grab Xicon from lucide if missing, but we'll use XCircle */}
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {detailsLoading ? (
                <div className="flex justify-center p-12 text-slate-400"><RefreshCw className="w-8 h-8 animate-spin" /></div>
              ) : details ? (
                <>
                  {/* Attached Image */}
                  {selectedRequest.image_url && (
                    <div className="bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
                      <a href={selectedRequest.image_url} target="_blank" rel="noreferrer">
                        <img 
                          src={selectedRequest.image_url} 
                          alt="Attached product" 
                          className="w-full h-32 object-contain hover:opacity-90 transition-opacity" 
                        />
                      </a>
                      <div className="px-3 py-1.5 bg-slate-100 border-t border-slate-200 text-xs text-slate-500 text-center">
                        Click image to view full size
                      </div>
                    </div>
                  )}

                  {/* Justification */}
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                    <h3 className="text-sm font-semibold text-blue-900 mb-1.5 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> Business Justification
                    </h3>
                    <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{selectedRequest.reason}</p>
                  </div>

                  {/* Previous Action Remarks */}
                  {details.latestRemark && details.latestRemark.remarks && (
                    <div className={`border rounded-xl p-5 ${
                      details.latestRemark.action === 'REJECT' ? 'bg-red-50/50 border-red-100' :
                      details.latestRemark.action === 'SEND_BACK' ? 'bg-amber-50/50 border-amber-100' :
                      'bg-emerald-50/50 border-emerald-100'
                    }`}>
                      <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${
                        details.latestRemark.action === 'REJECT' ? 'text-red-900' :
                        details.latestRemark.action === 'SEND_BACK' ? 'text-amber-900' :
                        'text-emerald-900'
                      }`}>
                        <MessageSquare className="w-4 h-4" /> 
                        {details.latestRemark.action === 'REJECT' ? 'Rejection Reason' :
                         details.latestRemark.action === 'SEND_BACK' ? 'Send Back Reason' :
                         'Approval Remarks'}
                      </h3>
                      <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed italic border-l-2 pl-3 border-slate-300">
                        "{details.latestRemark.remarks}"
                      </p>
                    </div>
                  )}

                  {/* Specific Details */}
                  {selectedRequest.type === 'PURCHASE' ? (
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-4 border-b pb-2">Purchase Details</h3>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div>
                          <dt className="text-slate-500">Supplier</dt>
                          <dd className="font-medium text-slate-900">{details.supplier}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Item Category</dt>
                          <dd className="font-medium text-slate-900">{details.item_category}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Item Name</dt>
                          <dd className="font-medium text-slate-900">{details.item_name}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">SKU</dt>
                          <dd className="font-medium text-slate-900">{details.sku}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Quantity</dt>
                          <dd className="font-medium text-slate-900">{details.quantity}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Unit Price</dt>
                          <dd className="font-medium text-slate-900">₹{parseFloat(details.unit_price).toFixed(2)}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 bg-slate-900 text-white p-3 rounded-xl flex justify-between items-center">
                        <span className="font-medium text-sm">Total Amount Request</span>
                        <span className="text-xl font-bold">₹{parseFloat(details.total_amount).toFixed(2)}</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-4 border-b pb-2">Discount Details</h3>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div>
                          <dt className="text-slate-500">Customer Name</dt>
                          <dd className="font-medium text-slate-900">{details.customer_name}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Mobile</dt>
                          <dd className="font-medium text-slate-900">{details.customer_mobile}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-slate-500">Product</dt>
                          <dd className="font-medium text-slate-900">{details.brand} {details.product_name} (SKU: {details.sku})</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Original Price</dt>
                          <dd className="font-medium text-slate-900 line-through text-slate-400">₹{parseFloat(details.original_price).toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Discount Requested</dt>
                          <dd className="font-medium text-emerald-600">₹{parseFloat(details.discount_amount).toFixed(2)} ({parseFloat(details.discount_percentage).toFixed(1)}%)</dd>
                        </div>
                      </dl>
                      <div className="mt-4 bg-slate-900 text-white p-3 rounded-xl flex justify-between items-center">
                        <span className="font-medium text-sm">Final Price to Customer</span>
                        <span className="text-xl font-bold">₹{parseFloat(details.final_price).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-slate-500">Could not load details.</div>
              )}
            </div>

            {/* Action Footer */}
            {['PENDING_L1', 'PENDING_L2'].includes(selectedRequest.status) && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Approval Remarks</label>
                  <textarea 
                    rows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Enter remarks (Mandatory for Reject/Send Back)..."
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction('APPROVE')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium shadow-sm transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle className="w-5 h-5" /> Approve
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction('SEND_BACK')}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2.5 rounded-lg font-medium transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className="w-5 h-5" /> Send Back
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction('REJECT')}
                    className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2.5 rounded-lg font-medium transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    <XCircle className="w-5 h-5" /> Reject
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
