import { AppRouter } from "./routes/AppRouter";
import { AuthProvider } from "./contexts/AuthContext";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default App;
