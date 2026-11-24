import type { AdminCustomer, DetailWidgetProps } from '@medusajs/framework/types';
import { defineWidgetConfig } from '@medusajs/admin-sdk';
import NoteWidget from '../components/note';
import { useFeatureEnabled } from '../lib/use-feature-flags';

const CustomerNoteWidget = ({ data }: DetailWidgetProps<AdminCustomer>) => {
  const enabled = useFeatureEnabled('notes');
  if (!enabled) return null;

  return <NoteWidget entityType={'customer'} entityId={data.id} />;
};

export const config = defineWidgetConfig({
  zone: 'customer.details.side',
});

export default CustomerNoteWidget;
