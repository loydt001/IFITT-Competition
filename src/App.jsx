import { Toaster } from "@/components/ui/toaster"
import React, { useState, Suspense, lazy, useEffect, createContext } from 'react';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ErrorBoundary from './lib/ErrorBoundary';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { initializeMonitoring } from '@/lib/monitoring';
import { initSentry } from '@/lib/sentry';
import { initAnalytics, trackPageView } from '@/lib/analytics';
import { startNotificationScheduler } from '@/hooks/useNotificationScheduler';
import { crashReporter } from '@/lib/crashReporter';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import GuestLanding from '@/components/GuestLanding';
import { StatThemeProvider } from '@/lib/StatThemeContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import { LanguageProvider } from '@/lib/LanguageContext';
import { GlobalTranslator } from '@/lib/AutoTranslateContext';
import { TutorialProvider } from '@/lib/TutorialContext';
import { useNotificationPrompt } from '@/hooks/useNotificationPrompt';
import { useReengagementNotifications } from '@/hooks/useReengagementNotifications';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import NotificationPrompt from '@/components/notifications/NotificationPrompt';
import AppLayout from '@/components/layout/AppLayout';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import Home from '@/pages/Home';
import { useLocation } from 'react-router-dom';
import { playNavigationWhoosh, isSoundEnabled } from '@/lib/uiSounds';
import Characters from '@/pages/Characters';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';
import ProgressionMap from '@/pages/ProgressionMap';
import Subscription from '@/pages/Subscription';
import Nutrition from '@/pages/Nutrition';
import Insights from '@/pages/Insights';
import Duel from '@/pages/Duel';
import LoreLibrary from '@/pages/LoreLibrary';
import ChallengeLive from '@/pages/ChallengeLive';
import PublicProfile from '@/pages/PublicProfile';
import Tutorials from '@/pages/Tutorials';
import Goals from '@/pages/Goals';
import PremiumContent from '@/pages/PremiumContent';
import RoadRunners from '@/pages/RoadRunners';
import Events from '@/pages/Events';
import Search from '@/pages/Search';
import DeleteAccount from '@/pages/DeleteAccount';
import Friends from '@/pages/Friends';
import Community from '@/pages/Community';
import Social from '@/pages/Social';
import Competition from '@/pages/Competition.jsx';
import AdminFeedback from '@/pages/AdminFeedback';
import SupportDashboard from '@/pages/SupportDashboard';
import AdminDashboard from '@/pages/AdminDashboard';
import SplashScreen from '@/components/SplashScreen';
import SpaceJourneyAnimation from '@/components/animations/SpaceJourneyAnimation';
import { splashAudio } from '@/lib/splashAudioSynthesizer';
import ScrollIndicator from '@/components/ScrollIndicator';
import OfflineBanner from '@/components/shared/OfflineBanner';
import InteractiveTutorial from '@/components/tutorial/InteractiveTutorial';
import ChatbotProvider from '@/components/chatbot/ChatbotProvider';
import LisaAmbientPresence from '@/components/chatbot/LisaAmbientPresence';
import ReferralAutoRedeem from '@/components/referral/ReferralAutoRedeem';

// Prime the AudioContext on the very first user gesture — must run before
// any component mounts so the gesture listener is in place immediately.
splashAudio.primeOnFirstGesture();

// Lazy load heavy pages to defer asset loading
const Leaderboard = lazy(() => import('@/pages/Leaderboard.jsx'));
const GlobalLeaderboard = lazy(() => import('@/pages/GlobalLeaderboard.jsx'));
const Feed = lazy(() => import('@/pages/Feed.jsx'));
const Stats = lazy(() => import('@/pages/Stats.jsx'));
const Squads = lazy(() => import('@/pages/Squads.jsx'));
const SessionHistory = lazy(() => import('@/pages/SessionHistory.jsx'));

// Loading fallback component
function CompetitionLoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-gray-700 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Loading competition arena...</p>
      </div>
    </div>
  );
}


const AuthenticatedApp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user } = useAuth();
  const [guestMode, setGuestMode] = useState(false);
  const { showPrompt, handleEnable, handleDismiss } = useNotificationPrompt();
  const [splashDone, setSplashDone] = useState(() => location.pathname === '/AdminFeedback');
  const [showSpaceJourney, setShowSpaceJourney] = useState(false);
  const [lastPath, setLastPath] = useState(null);
  // Always land on Home — never skip straight to Competition on first load
  const intendedPath = (location.pathname !== '/' && location.pathname !== '/Competition') ? location.pathname : '/Home';
  
  // Initialize error tracking, crash reporting, and analytics
  useEffect(() => {
    initializeMonitoring();
    initSentry();
    initAnalytics();
    startNotificationScheduler();
    window.addEventListener('beforeunload', () => {
      crashReporter.flush();
    });
  }, []);

  // Call hooks safely inside authenticated app context
  useReengagementNotifications();
  useOfflineSync(); // Monitor online/offline and sync offline runs

  // Play navigation whoosh on route change (at reduced volume)
  useEffect(() => {
    if (lastPath && location.pathname !== lastPath && splashDone && isSoundEnabled()) {
      playNavigationWhoosh();
    }
    setLastPath(location.pathname);
  }, [location.pathname, splashDone]);

  const { data: profiles } = useQuery({
    // IRON WALL: query key is scoped to user ID — different users never share cache
    queryKey: ["userProfile", user?.id],
    queryFn: async () => {
      // Double-check identity at query time to prevent stale-closure cache hits
      const me = await base44.auth.me();
      if (!me || me.id !== user?.id) {
        throw new Error('[IRON WALL] User identity mismatch at query time — blocked');
      }
      return base44.entities.UserProfile.filter({ created_by: me.email });
    },
    enabled: !!user?.id && !!user?.email,
  });
  const currentProfile = profiles?.[0];

  // Wait for auth to resolve before doing anything (including splash)
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-4 border-gray-700 border-t-green-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
      if (authError.type === 'user_not_registered') {
        return <UserNotRegisteredError />;
      } else if (authError.type === 'auth_required') {
        if (guestMode) {
          // Guest mode: render Competition directly (only accessible page without auth)
          return <Competition />;
        }
        return <GuestLanding onContinueAsGuest={() => setGuestMode(true)} />;
      }
    }

  // Show splash screen only once auth is confirmed
  if (!splashDone) {
    return (
      <>
        <SplashScreen onComplete={() => {
          setShowSpaceJourney(true);
        }} />
        {showSpaceJourney && (
          <SpaceJourneyAnimation onComplete={() => {
            setSplashDone(true);
            navigate(intendedPath);
          }} />
        )}
      </>
    );
  }

  // Render the main app
  return (
    <StatThemeProvider profile={currentProfile}>
      <ChatbotProvider />
      <LisaAmbientPresence profile={currentProfile} lisaImageUrl="https://media.base44.com/images/public/69b84044a3aaadc575a589a9/798b0ebcb_generated_image.png" />
      <ReferralAutoRedeem user={user} />
      <NotificationPrompt isOpen={showPrompt} onEnable={handleEnable} onDismiss={handleDismiss} />
      <Routes>
      <Route path="/" element={<Navigate to="/Home" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/Home" element={<Home />} />
        <Route path="/Leaderboard" element={<Suspense fallback={<CompetitionLoadingFallback />}><Leaderboard /></Suspense>} />
        <Route path="/GlobalLeaderboard" element={<Suspense fallback={<CompetitionLoadingFallback />}><GlobalLeaderboard /></Suspense>} />
        <Route path="/Characters" element={<Characters />} />
        <Route path="/LoreLibrary" element={<LoreLibrary />} />
        <Route path="/Tutorials" element={<Tutorials />} />
        <Route path="/Profile" element={<Profile />} />
        <Route path="/Settings" element={<Settings />} />
        <Route path="/ProgressionMap" element={<ProgressionMap />} />
        <Route path="/Stats" element={<Suspense fallback={<CompetitionLoadingFallback />}><Stats /></Suspense>} />
        <Route path="/Subscription" element={<Subscription />} />
        <Route path="/Feed" element={<Suspense fallback={<CompetitionLoadingFallback />}><Feed /></Suspense>} />
        <Route path="/Community" element={<Community />} />
        <Route path="/Social" element={<Social />} />
        <Route path="/Nutrition" element={<Nutrition />} />
        <Route path="/Squads" element={<Suspense fallback={<CompetitionLoadingFallback />}><Squads /></Suspense>} />
        <Route path="/Insights" element={<Insights />} />
        <Route path="/SessionHistory" element={<Suspense fallback={<CompetitionLoadingFallback />}><SessionHistory /></Suspense>} />
        <Route path="/Goals" element={<Goals />} />
        <Route path="/PremiumContent" element={<PremiumContent />} />
        <Route path="/RoadRunners" element={<RoadRunners />} />
        <Route path="/Events" element={<Events />} />
        <Route path="/Search" element={<Search />} />
        <Route path="/Friends" element={<Friends />} />
      </Route>
      <Route path="/Competition" element={<Competition />} />
      <Route path="/Profile/:profileId" element={<PublicProfile />} />
      <Route path="/Duel" element={<Duel />} />
      <Route path="/Challenge/:sessionId" element={<ChallengeLive />} />
      <Route path="/DeleteAccount" element={<DeleteAccount />} />
      <Route path="/AdminFeedback" element={<AdminFeedback />} />
      <Route path="/SupportDashboard" element={<SupportDashboard />} />
      <Route path="/AdminDashboard" element={<AdminDashboard />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </StatThemeProvider>
  );
};


function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider>
          <TutorialProvider>
            <QueryClientProvider client={queryClientInstance}>
              <AuthProvider>
                <GlobalTranslator>
                  <Router>
                    <AuthenticatedApp />
                    <OfflineBanner />
                    <InteractiveTutorial />
                  </Router>
                  <Toaster />
                </GlobalTranslator>
              </AuthProvider>
            </QueryClientProvider>
          </TutorialProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  )
}

export default App