import React, { useState } from 'react';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import { AppState, UserProfile } from './types';

// Developed by Yash Kant Tiwary (PW26173)

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    apiKey: null,
    profile: null,
    history: []
  });

  // State is purely in-memory to comply with strict environment constraints.
  // No localStorage is used.
  const saveState = (newState: AppState) => {
    setAppState(newState);
  };

  const handleOnboardingComplete = (apiKey: string, profile: UserProfile) => {
    saveState({
      ...appState,
      apiKey,
      profile
    });
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to disconnect? Your API key will be removed.")) {
      const resetState = { apiKey: null, profile: null, history: [] };
      saveState(resetState);
    }
  };

  return (
    <div className="bg-pw-bg text-pw-text h-screen w-full">
      {!appState.apiKey ? (
        <Onboarding onComplete={handleOnboardingComplete} />
      ) : (
        <Dashboard 
          appState={appState} 
          onLogout={handleLogout} 
          onUpdateAppState={saveState}
        />
      )}
    </div>
  );
};

export default App;