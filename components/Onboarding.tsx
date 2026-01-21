import React, { useState } from 'react';
import { Eye, EyeOff, Check, ArrowRight, Loader2, HelpCircle, ExternalLink } from 'lucide-react';
import { ContentType, UserProfile } from '../types';
import { GeminiService } from '../services/geminiService';
import { CONTENT_TYPE_OPTIONS } from '../constants';

// Developed by Yash Kant Tiwary (PW26173)

interface OnboardingProps {
  onComplete: (apiKey: string, profile: UserProfile) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    defaultContentType: ContentType.VIDEO_SCRIPT
  });

  const handleTestConnection = async () => {
    setIsValidating(true);
    setIsValid(null);
    const service = new GeminiService(apiKey);
    const valid = await service.validateKey();
    setIsValid(valid);
    setIsValidating(false);
  };

  const handleStep1Submit = () => {
    if (isValid) setStep(2);
  };

  const handleFinish = () => {
    onComplete(apiKey, profile);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white p-4 relative">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden border border-pw-border">
        {/* Header */}
        <div className="bg-pw-blue p-8 text-center text-white">
          <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            PW
          </div>
          <h1 className="text-2xl font-bold mb-2">Content Compliance Checker</h1>
          <p className="text-blue-100 opacity-90">Ensure every word meets legal guidelines</p>
        </div>

        {/* Body */}
        <div className="p-8">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-pw-text">Step 1: API Configuration</h2>
                <span className="text-sm text-pw-muted">1 of 2</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-pw-text mb-2">
                  Gemini API Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setIsValid(null);
                    }}
                    className="w-full px-4 py-3 rounded-lg border border-pw-border focus:ring-2 focus:ring-pw-blue focus:border-transparent outline-none font-mono text-sm"
                    placeholder="AIza..."
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-3 text-pw-muted hover:text-pw-text"
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                
                <div className="flex justify-between items-center mt-3">
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-xs text-pw-blue flex items-center gap-1 hover:underline font-medium focus:outline-none transition-colors"
                  >
                    Get Key from Google AI Studio <ExternalLink size={12} />
                  </a>
                  <button 
                    onClick={() => setShowHelp(!showHelp)}
                    className="text-xs text-pw-blue flex items-center gap-1 hover:underline font-medium focus:outline-none transition-colors"
                  >
                    <HelpCircle size={12} />
                    {showHelp ? 'Hide help' : 'Need help?'}
                  </button>
                </div>

                {showHelp && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-pw-text">
                    <h4 className="font-semibold text-pw-blue mb-2">How to get a free API Key:</h4>
                    <ol className="list-decimal pl-4 space-y-1.5">
                      <li>Log in to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-pw-blue hover:underline inline-flex items-center">Google AI Studio <ExternalLink size={10} className="ml-0.5" /></a> with your Google account.</li>
                      <li>Click on the blue <strong>"Create API key"</strong> button.</li>
                      <li>Select <strong>"Create API key in new project"</strong>.</li>
                      <li>Copy the key string (starts with <code>AIza</code>) and paste it here.</li>
                    </ol>
                  </div>
                )}
              </div>

              {isValid === true && (
                <div className="flex items-center text-pw-success text-sm bg-green-50 p-3 rounded-md">
                  <Check size={16} className="mr-2" />
                  Connection successful
                </div>
              )}
              
              {isValid === false && (
                <div className="flex items-center text-pw-error text-sm bg-red-50 p-3 rounded-md">
                  <span className="mr-2">⚠️</span>
                  Connection failed. Please check your key.
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={handleTestConnection}
                  disabled={!apiKey || isValidating}
                  className="px-4 py-2 text-pw-blue border border-pw-blue rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center flex-1"
                >
                  {isValidating ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                  Test Connection
                </button>
                <button
                  onClick={handleStep1Submit}
                  disabled={!isValid}
                  className="px-4 py-2 bg-pw-blue text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center flex-1"
                >
                  Continue
                  <ArrowRight size={16} className="ml-2" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-pw-text">Step 2: Profile (Optional)</h2>
                <span className="text-sm text-pw-muted">2 of 2</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-pw-text mb-2">Display Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  placeholder="e.g. Content Team"
                  className="w-full px-4 py-3 rounded-lg border border-pw-border focus:ring-2 focus:ring-pw-blue focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-pw-text mb-2">
                  Default Content Type 
                  <span className="text-pw-muted font-normal text-xs ml-2">(this can be changed later)</span>
                </label>
                <select
                  value={profile.defaultContentType}
                  onChange={(e) => setProfile({ ...profile, defaultContentType: e.target.value as ContentType })}
                  className="w-full px-4 py-3 rounded-lg border border-pw-border focus:ring-2 focus:ring-pw-blue focus:border-transparent outline-none bg-white"
                >
                  {CONTENT_TYPE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-between mt-10">
                <button
                  onClick={handleFinish}
                  className="text-pw-muted hover:text-pw-text text-sm font-medium px-4 py-2"
                >
                  Skip
                </button>
                <button
                  onClick={handleFinish}
                  className="px-6 py-2 bg-pw-blue text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium flex items-center"
                >
                  Complete Setup
                  <ArrowRight size={16} className="ml-2" />
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Progress Bar */}
        <div className="h-1 bg-gray-100 w-full">
           <div 
             className="h-full bg-pw-blue transition-all duration-300 ease-out"
             style={{ width: step === 1 ? '50%' : '100%' }}
           />
        </div>
      </div>

      {/* Watermark */}
      <div className="fixed bottom-4 right-4 text-[10px] text-gray-400 opacity-50 font-mono pointer-events-none select-none">
        Made by Yash Kant Tiwary Employee Code: PW26173
      </div>
    </div>
  );
};

export default Onboarding;