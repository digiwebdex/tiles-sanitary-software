import { useAuth } from "@/contexts/AuthContext";
import CollectionTracker from "@/modules/collections/CollectionTracker";

const CollectionsPage = () => {
  const { profile } = useAuth();
  const dealerId = profile?.dealer_id;

  if (!dealerId) {
    return <div className="p-6"><p className="text-muted-foreground">No dealer assigned.</p></div>;
  }

  return <CollectionTracker dealerId={dealerId} />;
};

export default CollectionsPage;
