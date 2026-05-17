import mongoose, { Schema, Document } from 'mongoose';

export interface IClient extends Document {
  email: string;
  name: string;
  applicationStatus: 'In Progress' | 'Approved' | 'Conditional Approval' | 'Settled' | 'Rejected' | 'Action Required' | 'In Review';
  rejectionReason: string | null; 
  outstandingDocuments: string[];
  assignedAdviser: {
    name: string;
    email: string;
    role?: string;
  };
}

const ClientSchema: Schema = new Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true,
    lowercase: true, 
    trim: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  applicationStatus: { 
    type: String, 
    required: true, 
    enum: ['In Progress', 'Approved', 'Conditional Approval', 'Settled', 'Rejected', 'Action Required', 'In Review'] 
  },
  rejectionReason: {
    type: String,
    default: null 
  },
  outstandingDocuments: [{ 
    type: String 
  }],
  assignedAdviser: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String }
  }
}, { 
  timestamps: true 
});

export const Client = mongoose.models.Client || mongoose.model<IClient>('Client', ClientSchema);