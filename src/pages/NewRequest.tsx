import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Package, Tag, ArrowRight, AlertCircle, X, UploadCloud } from 'lucide-react';

export default function NewRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Master Items State
  const [masterItems, setMasterItems] = useState<any[]>([]);

  useEffect(() => {
    fetchMasterItems();
  }, []);

  const fetchMasterItems = async () => {
    try {
      const { data, error } = await supabase.from('shoe_items').select('*').order('name');
      if (error) throw error;
      setMasterItems(data || []);
    } catch (err) {
      console.error('Failed to fetch items:', err);
    }
  };

  // Form State
  const [requestType, setRequestType] = useState<'PURCHASE' | 'DISCOUNT' | null>(null);
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT' | 'CRITICAL'>('NORMAL');
  const [reason, setReason] = useState('');

  // Purchase Specific State
  const [supplier, setSupplier] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemName, setItemName] = useState('');
  const [purSku, setPurSku] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [unitPrice, setUnitPrice] = useState<number | ''>('');

  // Discount Specific State
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [disSku, setDisSku] = useState('');
  const [originalPrice, setOriginalPrice] = useState<number | ''>('');
  const [discountAmount, setDiscountAmount] = useState<number | ''>('');

  // Image Upload State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // Derived values
  // Derived values
  const safeQuantity = quantity === '' ? 0 : quantity;
  const safeUnitPrice = unitPrice === '' ? 0 : unitPrice;
  const safeOriginalPrice = originalPrice === '' ? 0 : originalPrice;
  const safeDiscountAmount = discountAmount === '' ? 0 : discountAmount;

  const totalAmount = safeQuantity * safeUnitPrice;
  const finalPrice = safeOriginalPrice - safeDiscountAmount;
  const discountPercentage = safeOriginalPrice > 0 ? ((safeDiscountAmount / safeOriginalPrice) * 100).toFixed(2) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!user) throw new Error('You must be logged in to create a request');

      // 1. Upload Image (If exists)
      let imageUrl = null;
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('request-images')
          .upload(filePath, imageFile);
          
        if (uploadError) throw new Error(`Image Upload Error: ${uploadError.message}`);
        
        const { data: publicUrlData } = supabase.storage
          .from('request-images')
          .getPublicUrl(filePath);
          
        imageUrl = publicUrlData.publicUrl;
      }

      // 2. Generate Display ID
      const year = new Date().getFullYear();
      const prefix = requestType === 'PURCHASE' ? 'PUR' : 'DIS';
      
      // Get the latest request of this type FOR THIS YEAR to determine the next ID
      const { data: latestReq, error: latestError } = await supabase
        .from('shoe_requests')
        .select('display_id')
        .eq('type', requestType)
        .like('display_id', `${prefix}-${year}-%`)
        .order('display_id', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (latestError) throw latestError;
      
      let nextNum = 1;
      if (latestReq && latestReq.display_id) {
        const parts = latestReq.display_id.split('-');
        if (parts.length === 3) {
          const lastNum = parseInt(parts[2], 10);
          if (!isNaN(lastNum)) {
            nextNum = lastNum + 1;
          }
        }
      }
      
      let inserted = false;
      let requestData = null;
      let attempts = 0;
      let finalDisplayId = '';

      while (!inserted && attempts < 20) {
        const displayId = `${prefix}-${year}-${nextNum.toString().padStart(5, '0')}`;
        finalDisplayId = displayId;

        // 3. Insert main request
        const { data, error: requestError } = await supabase
          .from('shoe_requests')
          .insert([{
            display_id: displayId,
            type: requestType,
            requester_id: user.id,
            status: 'PENDING_L1',
            priority: priority,
            reason: reason,
            image_url: imageUrl
          }])
          .select()
          .single();

        if (requestError) {
          if (requestError.code === '23505') { // Unique constraint violation
            nextNum++;
            attempts++;
            continue;
          }
          throw requestError;
        }

        requestData = data;
        inserted = true;
      }

      if (!inserted || !requestData) {
        throw new Error('Could not generate a unique Request ID. Please try again.');
      }

      // 4. Insert specific details
      if (requestType === 'PURCHASE') {
        const { error: purError } = await supabase
          .from('shoe_purchase_details')
          .insert([{
            request_id: requestData.id,
            supplier: supplier,
            item_category: itemCategory,
            item_name: itemName,
            sku: purSku,
            quantity: quantity,
            unit_price: unitPrice,
            total_amount: totalAmount
          }]);
        if (purError) throw purError;
      } else {
        const { error: disError } = await supabase
          .from('shoe_discount_details')
          .insert([{
            request_id: requestData.id,
            customer_name: customerName,
            customer_mobile: customerMobile,
            product_name: productName,
            brand: brand,
            sku: disSku,
            original_price: originalPrice,
            discount_amount: discountAmount,
            discount_percentage: parseFloat(discountPercentage as string),
            final_price: finalPrice
          }]);
        if (disError) throw disError;
      }

      // 5. Create an audit log for creation
      await supabase.from('shoe_audit_logs').insert([{
        request_id: requestData.id,
        user_id: user.id,
        action: 'CREATED',
        new_status: 'PENDING_L1',
        remarks: 'Request generated by user.'
      }]);

      navigate('/dashboard', { state: { message: `Request ${finalDisplayId} created successfully.` } });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to submit request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">New Request</h1>
        <p className="mt-2 text-slate-600">Submit a new goods purchase or customer discount for approval.</p>
      </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setRequestType('PURCHASE')}
            className={`p-8 flex flex-col items-center justify-center gap-4 rounded-2xl border transition-all duration-300 ${
              requestType === 'PURCHASE' 
                ? 'bg-gradient-to-br from-brand-500 to-purple-600 text-white border-transparent shadow-lg shadow-brand-200 scale-[1.02]' 
                : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300 hover:bg-brand-50/50'
            }`}
          >
            <div className={`p-4 rounded-full transition-colors ${requestType === 'PURCHASE' ? 'bg-white/20' : 'bg-brand-100 text-brand-600'}`}>
              <Package className="w-8 h-8" />
            </div>
            <span className="text-lg font-bold">Goods Purchase</span>
          </button>
          
          <button
            type="button"
            onClick={() => setRequestType('DISCOUNT')}
            className={`p-8 flex flex-col items-center justify-center gap-4 rounded-2xl border transition-all duration-300 ${
              requestType === 'DISCOUNT' 
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-transparent shadow-lg shadow-emerald-200 scale-[1.02]' 
                : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
            }`}
          >
            <div className={`p-4 rounded-full transition-colors ${requestType === 'DISCOUNT' ? 'bg-white/20' : 'bg-emerald-100 text-emerald-600'}`}>
              <Tag className="w-8 h-8" />
            </div>
            <span className="text-lg font-bold">Customer Discount</span>
          </button>
        </div>

        {requestType && (
          <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 overflow-hidden mt-6">
            <form onSubmit={handleSubmit} className="p-8 space-y-8 animate-in slide-in-from-top-4 fade-in duration-300">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}

          {/* Common Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority Level</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                <option value="NORMAL">Normal</option>
                <option value="URGENT">Urgent</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product/Goods Image</label>
              {!imagePreview ? (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="text-sm text-slate-500"><span className="font-semibold">Click to upload</span></p>
                    <p className="text-xs text-slate-400">PNG, JPG up to 5MB</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                </label>
              ) : (
                <div className="relative w-full h-32 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 group">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="absolute top-2 right-2 bg-slate-900/50 hover:bg-slate-900 text-white p-1.5 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Purchase Fields */}
          {requestType === 'PURCHASE' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900 border-b pb-2">Purchase Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Supplier / Vendor</label>
                  <input
                    type="text"
                    required
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Item Category</label>
                  <input
                    type="text"
                    required
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    placeholder="e.g. Office Supplies, Electronics"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label>
                  <select
                    required
                    value={itemName}
                    onChange={(e) => {
                      const selectedItem = masterItems.find(i => i.name === e.target.value);
                      setItemName(e.target.value);
                      if (selectedItem) {
                        setPurSku(selectedItem.sku);
                        setItemCategory(selectedItem.category);
                      }
                    }}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                  >
                    <option value="" disabled>Select an item...</option>
                    {masterItems.map(item => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SKU / Model Number</label>
                  <input
                    type="text"
                    required
                    value={purSku}
                    onChange={(e) => setPurSku(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex justify-between items-center">
                <span className="text-slate-600 font-medium">Total Calculated Amount:</span>
                <span className="text-2xl font-bold text-slate-900">₹{totalAmount.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Discount Fields */}
          {requestType === 'DISCOUNT' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900 border-b pb-2">Customer & Discount Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer Mobile</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    pattern="[0-9]{10}"
                    title="Please enter exactly 10 digits"
                    value={customerMobile}
                    onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                    <select
                      required
                      value={productName}
                      onChange={(e) => {
                        const selectedItem = masterItems.find(i => i.name === e.target.value);
                        setProductName(e.target.value);
                        if (selectedItem) {
                          setDisSku(selectedItem.sku);
                          setBrand(selectedItem.category);
                        }
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                    >
                      <option value="" disabled>Select a product...</option>
                      {masterItems.map(item => (
                        <option key={item.id} value={item.name}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
                    <input
                      type="text"
                      required
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
                    <input
                      type="text"
                      required
                      value={disSku}
                      onChange={(e) => setDisSku(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Original Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Requested Discount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-slate-600 font-medium">Effective Discount</span>
                  <span className={`text-xl font-bold ${parseFloat(discountPercentage as string) > 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {discountPercentage}% OFF
                  </span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-slate-600 font-medium">Final Customer Price</span>
                  <span className="text-2xl font-bold text-slate-900">₹{finalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Reason Field */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business Justification / Reason</label>
            <textarea
              required
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none resize-none"
              placeholder="Please provide clear justification for this request..."
            />
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white shadow-sm transition-all
                ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:-translate-y-0.5'}
                ${requestType === 'PURCHASE' ? 'bg-brand-600 hover:bg-brand-700 focus:ring-brand-500' : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500'}
              `}
            >
              {loading ? 'Submitting...' : 'Submit Request'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </form>
        </div>
        )}
    </div>
  );
}
