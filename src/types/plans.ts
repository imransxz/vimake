export type PlanType = 'FREE' | 'CREATOR' | 'PRO' | 'VIRAL';

export interface PlanCredits {
  FREE: 0,
  CREATOR: 1000,
  PRO: 1800,
  VIRAL: 2700
}

export const CREDITS_PER_VIDEO = 30;

export const PLAN_CREDITS: PlanCredits = {
  FREE: 0,
  CREATOR: 1000,
  PRO: 1800,
  VIRAL: 999999
}; 