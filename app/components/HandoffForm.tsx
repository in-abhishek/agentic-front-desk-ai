'use client';
import { useForm } from 'react-hook-form';
import { useApi } from '../hooks/useApi';

type HandoffInput = {
  fullName: string;
  phone: string;
  email: string;
  query: string;
};

export default function HandoffForm({ defaultEmail }: { defaultEmail: string }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<HandoffInput>({
        defaultValues: { email: defaultEmail },
        mode: "onChange" 
});

  const { loading, error: apiError, request } = useApi();

  const dynamicScriptRegex = /<[^>]*>/g;
  const onSubmit = async (formData: HandoffInput) => {
  const result = await request('/api/handoff', 'POST', formData);
  if (result) {
    alert("Details submitted successfully!");
    reset({ fullName: '', phone: '', query: '', email: defaultEmail }); 
  }
};

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-white p-4 rounded-lg shadow-sm border">
      {apiError && <p className="text-red-500 text-xs bg-red-50 p-2 rounded">{apiError}</p>}

      <div>
        <label className="text-xs font-bold text-gray-600 block mb-1">Full Name</label>
        <input 
          {...register("fullName", { 
            required: "Name is required",
            minLength: { value: 3, message: "Minimum 3 characters required" },
            maxLength: { value: 50, message: "Maximum 50 characters allowed" },
            validate: {
              noScripts: (value) => !dynamicScriptRegex.test(value) || "HTML or Script tags are not allowed!"
            }
          })} 
          className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            errors.fullName ? 'border-red-500 focus:ring-red-500/20' : 'border-gray-300 focus:ring-blue-500/20'
          }`}
          placeholder="Rahul Kumar"
        />
        {errors.fullName && <p className="text-red-500 text-xs mt-1 font-medium">{errors.fullName.message}</p>}
      </div>

      <div>
        <label className="text-xs font-bold text-gray-600 block mb-1">Phone Number</label>
        <input 
          type="tel" 
          {...register("phone", { 
            required: "Phone number is required",
            pattern: {
              value: /^[6-9]\d{9}$/, 
              message: "Please enter a valid 10-digit mobile number"
            }
          })} 
          className={`w-full border rounded px-3 py-2 text-gray-600 text-sm focus:outline-none focus:ring-2 ${
            errors.phone ? 'border-red-500 focus:ring-red-500/20' : 'border-gray-300 focus:ring-blue-500/20'
          }`}
          placeholder="9876543210"
        />
        {errors.phone && <p className="text-red-500 text-xs mt-1 font-medium">{errors.phone.message}</p>}
      </div>

      <div>
        <label className="text-xs font-bold text-gray-600 block mb-1">Email Address</label>
        <input 
          type="email"
          {...register("email", { required: "Email is required" })} 
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
          readOnly
        />
      </div>

      <div>
        <label className="text-xs font-bold text-gray-600 block mb-1">Your Requirement</label>
        <textarea 
          {...register("query", { 
            required: "Please enter your query",
            maxLength: { value: 500, message: "Query cannot exceed 500 characters" },
            validate: {
              noScripts: (value) => !dynamicScriptRegex.test(value) || "HTML or Script tags are not allowed!"
            }
          })} 
          rows={3}
          className={`w-full border resize-none rounded px-3 text-gray-600 py-2 text-sm focus:outline-none focus:ring-2 ${
            errors.query ? 'border-red-500 focus:ring-red-500/20' : 'border-gray-300 focus:ring-blue-500/20'
          }`}
          placeholder="I want to discuss home loan eligibility..."
        />
        {errors.query && <p className="text-red-500 text-xs mt-1 font-medium">{errors.query.message}</p>}
      </div>

      <button 
        type="submit" 
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 rounded text-sm transition"
      >
        {loading ? "Submitting..." : "Connect with Adviser"}
      </button>
    </form>
  );
}