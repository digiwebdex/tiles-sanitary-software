import { useDealerId } from "@/hooks/useDealerId";
import ProductList from "@/modules/products/ProductList";

const ProductsPage = () => {
  const dealerId = useDealerId();

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <ProductList dealerId={dealerId} />
    </div>
  );
};

export default ProductsPage;
