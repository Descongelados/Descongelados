import { useState } from 'react';
import Sidebar, { ViewKey } from './components/Sidebar';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider, useAuth } from './lib/auth';
import LoginScreen from './components/LoginScreen';
import Dashboard from './views/Dashboard';
import Inventory from './views/Inventory';
import Purchases from './views/Purchases';
import Sales from './views/Sales';
import Customers from './views/Customers';
import Suppliers from './views/Suppliers';
import Collections from './views/Collections';
import Reports from './views/Reports';
import Settings from './views/Settings';

function AppShell() {
  const { currentUser } = useAuth();
  const [view, setView] = useState<ViewKey>('dashboard');

  if (!currentUser) return <LoginScreen />;

  return (
    <div className="flex min-h-screen bg-ink-50">
      <Sidebar current={view} onNavigate={setView} />
      <main className="flex-1 min-w-0 lg:pl-0">
        <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1400px] mx-auto pt-16 lg:pt-8">
          {view === 'dashboard'   && <Dashboard onNavigate={setView} />}
          {view === 'inventory'   && <Inventory />}
          {view === 'purchases'   && <Purchases />}
          {view === 'sales'       && <Sales />}
          {view === 'customers'   && <Customers />}
          {view === 'suppliers'   && <Suppliers />}
          {view === 'collections' && <Collections />}
          {view === 'reports'     && <Reports />}
          {view === 'settings'    && <Settings />}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
