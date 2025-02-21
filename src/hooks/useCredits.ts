import { useState, useEffect } from 'react';
import { PlanType, PLAN_CREDITS, CREDITS_PER_VIDEO } from '@/types/plans';

export function useCredits() {
  const [currentPlan, setCurrentPlan] = useState<PlanType>('VIRAL');
  const [creditsUsed, setCreditsUsed] = useState(0);
  
  const totalCredits = PLAN_CREDITS[currentPlan];
  const remainingCredits = totalCredits - creditsUsed;
  const creditsPercentage = (creditsUsed / totalCredits) * 100;

  // Fonction pour vérifier si l'utilisateur a assez de crédits
  const hasEnoughCredits = () => remainingCredits >= CREDITS_PER_VIDEO;

  // Fonction pour utiliser des crédits
  const spendCredits = async () => {
    if (!hasEnoughCredits()) {
      throw new Error('Not enough credits');
    }
    
    setCreditsUsed(prev => prev + CREDITS_PER_VIDEO);
    // Ici, vous pouvez ajouter la logique pour sauvegarder dans la base de données
  };

  // Vérifier le plan Whop de l'utilisateur
  useEffect(() => {
    const checkWhopPlan = async () => {
      try {
        // Intégrer ici l'API Whop pour vérifier le plan
        // const plan = await whop.checkUserPlan();
        // setCurrentPlan(plan);
      } catch (error) {
        console.error('Error checking Whop plan:', error);
      }
    };

    checkWhopPlan();
  }, []);

  return {
    currentPlan,
    totalCredits,
    remainingCredits,
    creditsPercentage,
    hasEnoughCredits,
    spendCredits
  };
} 