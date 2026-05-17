import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Lead } from '@/models/Lead';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const { fullName, email, phone, query } = body;

    if (!fullName || !email || !phone) {
      return NextResponse.json(
        { error: 'Missing required fields: fullName, email, or phone' },
        { status: 400 }
      );
    }

    await connectDB();

    const newLead = await Lead.create({
      name: fullName.trim(), 
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      query: query?.trim(),
      status: 'NEW', 
    });

    return NextResponse.json(
      { success: true, message: 'Details saved successfully!', data: newLead },
      { status: 201 }
    );

  } catch (error: any) {
    console.error(' Handoff API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}