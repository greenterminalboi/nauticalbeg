import { FileLoader } from "./components/Overview/FileLoader";

export function App() {
  return (
    <main>
      <h1>NauticalBeg</h1>
      <p>EU5 save analysis — load a save to get started.</p>
      <FileLoader />
    </main>
  );
}
