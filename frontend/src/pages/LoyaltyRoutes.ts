import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { PermissionOnly } from '../App';

// Lazy load Loyalty screen
const Loyalty = lazy(() => import('./Loyalty'));

// Add to the pages array in App.tsx dynamically or manually.
// Since App.tsx is a file we can edit, let's edit App.tsx first to include the route,
// and then create the Loyalty.tsx file.

export const LoyaltyRoutes = [
  ['loyalty', Loyalty, 'loyalty.read'],
] as const;
