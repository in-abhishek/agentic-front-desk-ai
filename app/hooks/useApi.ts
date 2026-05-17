'use client';
import { useState, useCallback } from 'react';

interface UseApiResponse<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  request: (url: string, method?: 'GET' | 'POST', body?: any) => Promise<T | null>;
}

export function useApi<T = any>(): UseApiResponse<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (url: string, method: 'GET' | 'POST' = 'GET', body: any = null) => {
    setLoading(true);
    setError(null);
    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (method === 'POST' && body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP Error! Status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      return result;
    } catch (err: any) {
      const errMsg = err.message || 'Something went wrong';
      setError(errMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, request };
}