import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PackageSearch, Plus, ArrowRight, RefreshCw, AlertCircle, Download, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { Pagination } from '../components/Pagination';

export default function Items() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // New item form
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('name', { ascending: true });
        
      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch items');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('items')
        .insert([{
          name,
          sku,
          category
        }]);
        
      if (error) throw error;
      
      // Reset form and reload
      setName('');
      setSku('');
      setCategory('');
      setIsAdding(false);
      fetchItems();
    } catch (err: any) {
      console.error(err);
      setError('Failed to add item. Check if SKU already exists.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csv = Papa.unparse([
      { Name: 'Example Product 1', SKU: 'SKU-001', Category: 'Category A' },
      { Name: 'Example Product 2', SKU: 'SKU-002', Category: 'Category B' }
    ]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'master_items_template.csv';
    link.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = results.data as any[];
          
          const itemsToInsert = data.map((row, index) => {
            if (!row.Name || !row.SKU || !row.Category) {
              throw new Error(`Row ${index + 1}: Missing required columns. Ensure Name, SKU, and Category exist.`);
            }
            return {
              name: row.Name.trim(),
              sku: row.SKU.trim(),
              category: row.Category.trim()
            };
          });

          if (itemsToInsert.length === 0) {
            throw new Error('No valid data found in CSV.');
          }

          const { error: insertError } = await supabase
            .from('items')
            .insert(itemsToInsert);

          if (insertError) {
            // Check for unique constraint violation on SKU
            if (insertError.code === '23505') {
              throw new Error('Duplicate SKU found. One or more SKUs in your CSV already exist in the system.');
            }
            throw insertError;
          }

          fetchItems();
          alert(`Successfully uploaded ${itemsToInsert.length} items!`);
        } catch (err: any) {
          console.error(err);
          setError(err.message || 'Failed to bulk upload items.');
        } finally {
          setIsUploading(false);
          e.target.value = '';
        }
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
        setIsUploading(false);
        e.target.value = '';
      }
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 relative">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Master Items Directory</h1>
          <p className="mt-2 text-slate-600">Manage products available for selection in requests.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Download className="w-5 h-5" />
            Template
          </button>
          
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm cursor-pointer ${
            isUploading ? 'bg-indigo-400 text-white cursor-not-allowed' : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700'
          }`}>
            {isUploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            {isUploading ? 'Uploading...' : 'Bulk Upload'}
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>

          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
          >
            {isAdding ? <PackageSearch className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            {isAdding ? 'View Items' : 'Add New Item'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {isAdding ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Add New Item</h2>
          <form onSubmit={handleAddItem} className="space-y-6 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item / Product Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. Nike Air Max 90"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">SKU / Model Number</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. NK-AM90-BLK"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category / Brand</label>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. Footwear"
              />
            </div>
            
            <button
              type="submit"
              disabled={submitLoading}
              className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-semibold text-white shadow-sm transition-all
                ${submitLoading ? 'opacity-70 cursor-not-allowed bg-indigo-600' : 'bg-indigo-600 hover:bg-indigo-700'}
              `}
            >
              {submitLoading ? 'Saving...' : 'Save Item'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <PackageSearch className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <p className="text-lg font-medium">No items found</p>
              <p className="text-sm">Click "Add New Item" to create your first product.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-sm font-semibold text-slate-900">Item Name</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-900">SKU</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-900">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{item.sku}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                          {item.category}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={currentPage}
                totalItems={items.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
