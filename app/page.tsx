// What shows when the app is opened from the Shopify admin. The portal itself
// is served at /proxy and reached by customers via the store's /apps/crew.
export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 32 }}>
      <h1>HEX Crew app is running</h1>
      <p>
        Customers see the portal at <code>/apps/crew</code> on the store.
      </p>
    </main>
  );
}
