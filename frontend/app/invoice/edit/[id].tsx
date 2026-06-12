import { useLocalSearchParams } from "expo-router";
import InvoiceEditor from "@/src/screens/InvoiceEditor";

export default function EditInvoice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InvoiceEditor invoiceId={id} />;
}
