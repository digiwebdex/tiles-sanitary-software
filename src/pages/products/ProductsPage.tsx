import ProductList from "@/modules/products/ProductList";

// TODO: Replace with actual dealer_id from auth context
const TEMP_DEALER_ID = "00000000-0000-0000-0000-000000000000";

const ProductsPage = () => {
  return (
    <div className="container mx-auto max-w-5xl p-6">
      <ProductList dealerId={TEMP_DEALER_ID} />
    </div>
  );
};

export default ProductsPage;
