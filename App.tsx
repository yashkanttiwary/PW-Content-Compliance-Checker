import React, { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import { AppState, UserProfile } from './types';

// Developed by Yash Kant Tiwary (PW26173)

const STORAGE_KEY = 'pw_compliance_app_state';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    apiKey: null,
    profile: null,
    history: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setAppState(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to load state", e);
      }
    }
    setLoading(false);
  }, []);

  const saveState = (newState: AppState) => {
    setAppState(newState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  };

  const handleOnboardingComplete = (apiKey: string, profile: UserProfile) => {
    saveState({
      ...appState,
      apiKey,
      profile
    });
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to reset settings? Your API key will be removed.")) {
      const resetState = { apiKey: null, profile: null, history: [] };
      saveState(resetState);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-pw-bg text-pw-text h-screen w-full">
      {!appState.apiKey ? (
        <Onboarding onComplete={handleOnboardingComplete} />
      ) : (
        <Dashboard appState={appState} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default App;