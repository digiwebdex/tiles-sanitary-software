import CreateProductPage from "@/pages/products/CreateProduct";

// TODO: Replace with actual dealer_id from auth context
const TEMP_DEALER_ID = "00000000-0000-0000-0000-000000000000";

const CreateProductRoute = () => (
  <div className="container mx-auto max-w-3xl p-6">
    <CreateProductPage dealerId={TEMP_DEALER_ID} />
  </div>
);

export default CreateProductRoute;
