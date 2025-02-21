import { useState, useEffect } from 'react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, HelpCircle } from "lucide-react";
import * as Accordion from '@radix-ui/react-accordion';
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PricingSkeleton } from "@/components/ui/PricingSkeleton";

const plans = [
  {
    price: "22",
    features: [
    ],
    isPopular: false,
  },
  {
    price: "39",
    features: [
      "200 videos per month",
      "4K video quality",
      "All Premium AI voices",
      "Advanced editing features",
      "Priority support",
      "Custom watermark",
      "API access",
    ],
    isPopular: true,
  },
  {
    price: "79",
    features: [
      "Unlimited videos",
      "8K video quality",
      "Custom AI voices",
      "White-label solution",
      "24/7 Premium support",
      "Custom features",
      "Dedicated account manager",
      "Multiple team seats",
    ],
    isPopular: false,
  },
];

const faqs = [
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards, PayPal, and cryptocurrency payments through Stripe."
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer: "Yes, you can cancel your subscription at any time. Your benefits will continue until the end of your billing period."
  },
  {
    question: "Do you offer a free trial?",
    answer: "Yes, we offer a 7-day free trial on all plans. You can test all features before committing to a subscription."
  },
  {
    question: "What's the difference between the plans?",
    answer: "The main differences are the number of videos you can create, video quality, number of AI voices available, and level of support. Professional and Enterprise plans also include additional features like API access and team collaboration."
  },
];

const ToggleGroup = ({ selected, onChange }: { 
  selected: 'monthly' | 'yearly', 
  onChange: (value: 'monthly' | 'yearly') => void 
}) => {
  return (
    <div className="inline-flex items-center p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
      <button
        onClick={() => onChange('monthly')}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
          selected === 'monthly'
            ? 'bg-white dark:bg-gray-700 text-primary shadow-sm'
            : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
      >
        Monthly
      </button>
      <button
        onClick={() => onChange('yearly')}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
          selected === 'yearly'
            ? 'bg-white dark:bg-gray-700 text-primary shadow-sm'
            : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
      >
        Yearly
        <span className="ml-1 text-xs text-primary">Save 20%</span>
      </button>
    </div>
  );
};

export default function Pricing() {
  const [currentPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);

  const getPrice = (basePrice: string) => {
    return billingCycle === 'yearly' 
      ? Math.round(Number(basePrice) * 0.8) 
      : basePrice;
  };

  useEffect(() => {
    setIsLoading(true);
    const isFirstVisit = !sessionStorage.getItem('visited');
    
    if (isFirstVisit) {
      sessionStorage.setItem('visited', 'true');
      const timer = setTimeout(() => setIsLoading(false), 1000);
      return () => clearTimeout(timer);
    } else {
      setIsLoading(false);
    }
  }, []);

  return (
    <>
      {isLoading ? (
        <PricingSkeleton />
      ) : (
        <div className="w-full max-w-7xl mx-auto p-6 space-y-24 pt-16">
          <div className="space-y-2 text-center">
            <h1 className="text-[#1A2042] dark:text-white text-[40px] font-bold">
              {t('pricing.title')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl mx-auto">
              {t('pricing.description')}
            </p>
          </div>

          {/* Billing cycle selector */}
          <div className="flex justify-center">
            <ToggleGroup
              selected={billingCycle}
              onChange={setBillingCycle}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {plans.map((plan, index) => {
              const planKey = ['creator', 'professional', 'enterprise'][index];
              return (
                <div
                  key={planKey}
                  className={cn(
                    "relative rounded-2xl p-8 transition-all duration-200",
                    "bg-background border-2",
                    "flex flex-col justify-between",
                    plan.isPopular 
                      ? "border-[#543CE5] shadow-lg shadow-[#543CE5]/10" 
                      : "border-gray-200 dark:border-gray-800"
                  )}
                >
                  {plan.isPopular && (
                    <div className="absolute -top-4 left-0 right-0 mx-auto w-fit px-4 py-1.5 rounded-full text-sm font-medium bg-[#543CE5] text-white">
                      {t('pricing.plans.mostPopular')}
                    </div>
                  )}

                  <div className="space-y-6 flex-1">
                    <div>
                      <h3 className="text-2xl font-bold">{t(`pricing.plans.${planKey}.name`)}</h3>
                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-4xl font-bold flex items-baseline">
                          €{getPrice(plan.price)}
                          <span className="text-gray-500 text-base font-normal ml-1">
                            /{billingCycle === 'yearly' ? 'year' : 'month'}
                          </span>
                        </span>
                        {billingCycle === 'yearly' && (
                          <div className="ml-2 text-xs font-medium text-[#000000] dark:text-[#9C92FF] bg-[#543CE5]/10 dark:bg-[#543CE5]/20 px-2 py-1 rounded-full">
                            Save 20%
                          </div>
                        )}
                      </div>
                    </div>

                    <ul className="space-y-4">
                      {(t(`pricing.plans.${planKey}.features`) as unknown as string[]).map((feature: string) => (
                        <li key={feature} className="flex items-center gap-3">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#543CE5]/10">
                            <Check className="h-3.5 w-3.5 text-[#543CE5]" />
                          </div>
                          <span className="text-gray-600 dark:text-gray-300">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-8">
                    <Button
                      className={cn(
                        "w-full py-6 text-lg font-medium rounded-xl transition-all duration-200",
                        plan.isPopular
                          ? "bg-gradient-to-tr from-[#543CE5] to-[#9C92FF] text-white hover:opacity-90"
                          : "bg-[#543CE5]/10 text-[#543CE5] hover:bg-[#543CE5]/20"
                      )}
                    >
                      {t(`pricing.plans.buttons.${
                        planKey === 'creator' ? 'getStarted' :
                        planKey === 'professional' ? 'upgradePro' : 'contactSales'
                      }`)}
                    </Button>
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-3">
                      {t('pricing.cancelAnytime')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-8 mt-24">
            <div className="space-y-2 text-center">
              <h2 className="text-[#1A2042] dark:text-white text-3xl font-bold">
                {t('pricing.faqTitle')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                {t('pricing.faqSubtitle')}
              </p>
            </div>

            <Accordion.Root
              type="single"
              collapsible
              className="space-y-4 max-w-3xl mx-auto"
            >
              {(t('pricing.faqs') as unknown as Array<{ question: string; answer: string }>).map((faq, i) => (
                <Accordion.Item
                  key={i}
                  value={`item-${i}`}
                  className={cn(
                    "rounded-xl overflow-hidden transition-all duration-200",
                    "border-2 border-gray-200 dark:border-gray-800",
                    "data-[state=open]:border-[#543CE5]"
                  )}
                >
                  <Accordion.Trigger className="flex w-full items-center justify-between p-6 text-left">
                    <span className="font-medium text-[#1A2042] dark:text-white">{faq.question}</span>
                    <div className="h-5 w-5 shrink-0 rounded-full bg-[#543CE5]/10">
                      <HelpCircle className="h-5 w-5 text-[#543CE5] transition-transform duration-200 ease-out group-data-[state=open]:rotate-180" />
                    </div>
                  </Accordion.Trigger>
                  <Accordion.Content>
                    <div className="px-6 pb-6 text-gray-600 dark:text-gray-300">
                      {faq.answer}
                    </div>
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          </div>
        </div>
      )}
    </>
  );
} 