import type { Database as UpstreamDatabase } from './database.types';

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: string;
};
export type BillingCustomer = {
  user_id: string;
  customer_id: string;
  created_at: string;
};
export type Subscription = {
  subscription_id: string;
  user_id: string;
  customer_id: string;
  product_id: string;
  status: string;
  next_billing_date: string | null;
  expires_at: string | null;
  past_due_ends_at: string | null;
  cancel_at_next_billing_date: boolean;
  last_event_at: string;
};
type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

// Regenerate the full database types with Supabase after connecting a project.
// This explicit extension keeps the unconfigured template typed in the meantime.
export type FoundationDatabase = Omit<UpstreamDatabase, 'public'> & {
  public: Omit<UpstreamDatabase['public'], 'Tables' | 'Functions'> & {
    Tables: UpstreamDatabase['public']['Tables'] & {
      projects: Table<
        Project,
        {
          id?: string;
          user_id: string;
          name: string;
          description?: string;
          created_at?: string;
        }
      >;
      billing_customers: Table<
        BillingCustomer,
        { user_id: string; customer_id: string; created_at?: string }
      >;
      billing_subscriptions: Table<Subscription, Subscription>;
      billing_checkout_sessions: Table<
        {
          user_id: string;
          checkout_url: string | null;
          session_id: string | null;
          expires_at: string | null;
          lock_until: string;
        },
        {
          user_id: string;
          checkout_url?: string | null;
          session_id?: string | null;
          expires_at?: string | null;
          lock_until?: string;
        }
      >;
    };
    Functions: UpstreamDatabase['public']['Functions'] & {
      apply_dodo_subscription_event: {
        Args: {
          p_event_id: string;
          p_event_type: string;
          p_event_at: string;
          p_customer_id: string;
          p_subscription_id: string;
          p_product_id: string;
          p_status: string;
          p_next_billing_date: string | null;
          p_expires_at: string | null;
          p_past_due_ends_at: string | null;
          p_cancel_at_next_billing_date: boolean;
        };
        Returns: string;
      };
      take_request_slot: {
        Args: { p_key: string; p_limit: number; p_seconds: number };
        Returns: boolean;
      };
      claim_checkout: {
        Args: { p_user_id: string };
        Returns: { result: string; url?: string };
      };
    };
  };
};
