export default function Home() {
  return (
    <main className="card">
      <div className="badge">JetDeploy example: Next.js</div>

      <h1>Next.js, built standalone</h1>

      <p>
        This page is served by a Next.js App Router app, built with{" "}
        <code>output: &quot;standalone&quot;</code> and started with{" "}
        <code>node server.js</code> on port <code>8080</code>.
      </p>
    </main>
  );
}
