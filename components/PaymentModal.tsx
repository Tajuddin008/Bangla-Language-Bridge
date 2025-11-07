import React, { useState, useEffect, useCallback } from 'react';
import { ClearIcon, CreditCardIcon, MobileIcon, BankIcon } from './icons';
import { SubscriptionPlan } from '../App';
import { FREE_TRANSLATION_LIMIT, PREMIUM_TRANSLATION_LIMIT } from '../constants';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseSuccess: (plan: SubscriptionPlan) => void;
  currentPlan: SubscriptionPlan;
}

const PLANS = {
    FREE: {
        name: 'Free',
        price: { USD: 0, BDT: 0 },
        features: [
            `${FREE_TRANSLATION_LIMIT} translations`,
            'Standard voices',
            'Community support',
        ],
        cta: 'Current Plan'
    },
    PREMIUM: {
        name: 'Premium',
        price: { USD: 4.99, BDT: 499 },
        features: [
            `${PREMIUM_TRANSLATION_LIMIT} translations`,
            'Access to all voices',
            'Unlimited audio downloads',
            'Email support',
        ],
        cta: 'Upgrade'
    },
    PRO: {
        name: 'Pro',
        price: { USD: 9.99, BDT: 999 },
        features: [
            'Unlimited translations',
            'Access to all voices',
            'Unlimited audio downloads',
            'Priority support',
        ],
        cta: 'Upgrade'
    }
};

type ModalView = 'selection' | 'payment';

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onPurchaseSuccess, currentPlan }) => {
  const [currency, setCurrency] = useState('USD');
  const [activeTab, setActiveTab] = useState('card');
  const [view, setView] = useState<ModalView>('selection');
  const [planToPurchase, setPlanToPurchase] = useState<SubscriptionPlan | null>(null);


  const handleEscKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscKey);
      // Reset view when modal opens
      setView('selection');
      setPlanToPurchase(null);
    }
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, handleEscKey]);
  
  // Reset tab if current is not available for the selected currency
  useEffect(() => {
      if (currency === 'USD' && (activeTab === 'mobile' || activeTab === 'bank')) {
          setActiveTab('card');
      }
  }, [currency, activeTab]);

  if (!isOpen) return null;

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setPlanToPurchase(plan);
    setView('payment');
  }

  const handleUpgrade = () => {
    if (!planToPurchase) return;
    alert(`Thank you for upgrading to ${planToPurchase}! Your plan is now active. (This is a demo and no payment has been processed).`);
    onPurchaseSuccess(planToPurchase);
  }
  
  const selectedPlanDetails = planToPurchase ? PLANS[planToPurchase] : null;
  const currentPrice = selectedPlanDetails?.price[currency as keyof typeof selectedPlanDetails.price] ?? 0;
  const currencySymbol = currency === 'USD' ? '$' : '৳';
  
  const renderSelectionView = () => (
    <>
      <h2 className="text-2xl font-bold font-serif text-center text-gray-800 dark:text-gray-100 mb-2">Choose Your Plan</h2>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-6">Unlock more features by upgrading your plan.</p>
       {/* Currency Switcher */}
        <div className="flex justify-center mb-6">
            <div className="bg-black/10 dark:bg-white/10 rounded-lg p-1 flex">
              <button onClick={() => setCurrency('USD')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${currency === 'USD' ? 'bg-amber-800/80 text-white shadow' : 'text-gray-600 dark:text-gray-300'}`}>USD</button>
              <button onClick={() => setCurrency('BDT')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${currency === 'BDT' ? 'bg-amber-800/80 text-white shadow' : 'text-gray-600 dark:text-gray-300'}`}>BDT</button>
            </div>
        </div>
      <div className="space-y-4">
        {(Object.keys(PLANS) as SubscriptionPlan[]).map(planKey => {
          const plan = PLANS[planKey];
          const isCurrent = planKey === currentPlan;
          const isUpgradeTarget = (currentPlan === 'FREE' && (planKey === 'PREMIUM' || planKey === 'PRO')) || (currentPlan === 'PREMIUM' && planKey === 'PRO');
          const planPrice = plan.price[currency as keyof typeof plan.price];
          const displaySymbol = currency === 'USD' ? '$' : '৳';

          return (
            <div key={plan.name} className={`p-4 rounded-lg border-2 ${isCurrent ? 'border-amber-700 bg-amber-50/50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-gray-600'}`}>
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{plan.name}</h3>
                {isCurrent ? (
                  <span className="text-sm font-semibold bg-amber-700 text-white px-3 py-1 rounded-full">{plan.cta}</span>
                ) : isUpgradeTarget && (
                  <button onClick={() => handleSelectPlan(planKey)} className="text-sm font-semibold bg-amber-800/90 hover:bg-amber-800 text-white px-4 py-2 rounded-lg shadow-sm transition-transform hover:scale-105">
                      {plan.cta}
                  </button>
                )}
              </div>
              <p className="text-gray-600 dark:text-gray-300 mt-1">
                <span className="text-2xl font-bold">{displaySymbol}{planPrice}</span>
                <span className="text-sm">/mo</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                {plan.features.map(feature => (
                  <li key={feature} className="flex items-center">
                    <svg className="h-4 w-4 mr-2 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );

  const renderPaymentView = () => (
    <>
      <button onClick={() => setView('selection')} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" aria-label="Back to plan selection">
          <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
      </button>
      <h2 className="text-2xl font-bold font-serif text-center text-gray-800 dark:text-gray-100 mb-2">Upgrade to {selectedPlanDetails?.name}</h2>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-6">Complete your payment of <strong className="text-gray-800 dark:text-gray-200">{currencySymbol}{currentPrice}/mo</strong> to unlock new features.</p>
        {/* Payment Method Tabs */}
        <div className="border-b border-black/10 dark:border-white/10 mb-4">
            <nav className="-mb-px flex space-x-4" aria-label="Tabs">
              <button onClick={() => setActiveTab('card')} className={`group inline-flex items-center py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'card' ? 'border-amber-700 text-amber-800 dark:text-amber-500' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                  <CreditCardIcon className={`mr-2 h-5 w-5 ${activeTab === 'card' ? 'text-amber-700' : 'text-gray-400 group-hover:text-gray-500'}`} />
                  <span>Card</span>
              </button>
              <button onClick={() => setActiveTab('mobile')} disabled={currency === 'USD'} className={`group inline-flex items-center py-3 px-1 border-b-2 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed ${activeTab === 'mobile' ? 'border-amber-700 text-amber-800 dark:text-amber-500' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                  <MobileIcon className={`mr-2 h-5 w-5 ${activeTab === 'mobile' ? 'text-amber-700' : 'text-gray-400 group-hover:text-gray-500'}`} />
                  <span>Mobile</span>
              </button>
               <button onClick={() => setActiveTab('bank')} disabled={currency === 'USD'} className={`group inline-flex items-center py-3 px-1 border-b-2 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed ${activeTab === 'bank' ? 'border-amber-700 text-amber-800 dark:text-amber-500' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                  <BankIcon className={`mr-2 h-5 w-5 ${activeTab === 'bank' ? 'text-amber-700' : 'text-gray-400 group-hover:text-gray-500'}`} />
                  <span>Bank</span>
              </button>
            </nav>
        </div>
         {/* Tab Content */}
        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
            {activeTab === 'card' && (
                <div className="space-y-3">
                    <input type="text" placeholder="Card Number" className="w-full p-2.5 bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded-lg focus:ring-amber-700 focus:border-amber-700" />
                    <div className="flex gap-3">
                        <input type="text" placeholder="MM / YY" className="w-1/2 p-2.5 bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded-lg focus:ring-amber-700 focus:border-amber-700" />
                        <input type="text" placeholder="CVC" className="w-1/2 p-2.5 bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded-lg focus:ring-amber-700 focus:border-amber-700" />
                    </div>
                </div>
            )}
            {activeTab === 'mobile' && currency === 'BDT' && (
                <div className="p-4 bg-black/5 dark:bg-white/5 rounded-lg space-y-2">
                    <p className="font-semibold">Use bKash or Nagad to send money:</p>
                    <p>1. Open your mobile banking app.</p>
                    <p>2. Choose the 'Send Money' option.</p>
                    <p>3. Enter the number: <strong className="text-amber-800 dark:text-amber-500">01234567890</strong></p>
                    <p>4. Enter the amount and complete the transaction.</p>
                </div>
            )}
            {activeTab === 'bank' && currency === 'BDT' && (
                <div className="p-4 bg-black/5 dark:bg-white/5 rounded-lg space-y-1">
                    <p><span className="font-semibold w-28 inline-block">Bank Name:</span> Global Bank Ltd.</p>
                    <p><span className="font-semibold w-28 inline-block">Account Name:</span> Language Bridge</p>
                    <p><span className="font-semibold w-28 inline-block">Account No:</span> 123-456-7890</p>
                    <p><span className="font-semibold w-28 inline-block">Branch:</span> Main Branch</p>
                </div>
            )}
        </div>
        <button onClick={handleUpgrade} className="w-full mt-6 bg-amber-800 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300">
            Pay {currencySymbol}{currentPrice}/mo
        </button>
    </>
  );

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity duration-300" role="dialog" aria-modal="true">
      <div className="bg-paper-light dark:bg-paper-dark text-gray-800 dark:text-gray-200 rounded-2xl shadow-2xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-fade-in-scale">
        <div className="p-6 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" aria-label="Close modal">
            <ClearIcon className="h-6 w-6" />
          </button>
          {view === 'selection' ? renderSelectionView() : renderPaymentView()}
        </div>
        <style>{`
          @keyframes fade-in-scale {
            from { transform: scale(.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          .animate-fade-in-scale {
            animation: fade-in-scale 0.2s ease-out forwards;
          }
        `}</style>
      </div>
    </div>
  );
};

export default PaymentModal;