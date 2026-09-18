import SnakeGame from "@/components/SnakeGame";
export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <SnakeGame/>
    </main>
  );
}
