import { Schema, Document, models, model } from 'mongoose';

export interface ILead extends Document {
  name: string;
  email: string;
  phone: string;
  loanAmount?: number;
  query?: string;
  status: 'NEW' | 'CONTACTED' | 'RESOLVED';
  createdAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    loanAmount: {
      type: Number,
      default: 0,
    },
    query: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'RESOLVED'],
      default: 'NEW', 
    },
  },
  {
    timestamps: true, 
  }
);

export const Lead = models.Lead || model<ILead>('Lead', LeadSchema);