import { BillingView } from '~/components/foundation/billing-view';
export default function PreviewBilling() {
  return (
    <BillingView preview configured={false} paid={false} hasCustomer={false} />
  );
}
