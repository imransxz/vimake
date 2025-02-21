import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { 
  User, Sun, Moon, Globe, CreditCard, Gift, LogOut,
  Laptop, Smartphone, Trash2, AlertTriangle, ChevronRight, Coins, Plus, History
} from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const tabs = [
  { id: 'account', label: 'Account' },
  { id: 'credits', label: 'Credits' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'affiliation', label: 'Affiliation' },
];

const sessions = [
  { 
    device: 'Chrome on MacBook Pro',
    location: 'Paris, France',
    lastActive: 'Active now',
    type: 'laptop'
  },
  {
    device: 'Safari on iPhone 13',
    location: 'Paris, France',
    lastActive: '2 hours ago',
    type: 'smartphone'
  }
];

const creditHistory = [
  { 
    id: 1,
    type: 'usage',
    amount: -1,
    description: 'Video conversion',
    date: '2024-03-20 14:30'
  },
  {
    id: 2,
    type: 'purchase',
    amount: 100,
    description: 'Credit pack purchase',
    date: '2024-03-19 10:15'
  }
];

const springTransition = {
  type: "spring",
  stiffness: 200,
  damping: 25
};

export default function Settings() {
  const [activeTab, setActiveTab] = useState('account');
  const { language, setLanguage } = useLanguage();
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('theme') as 'dark' | 'light') || 'light'
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSignOutDialogOpen, setIsSignOutDialogOpen] = useState(false);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="container max-w-6xl mx-auto p-6 space-y-8"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <div className="flex items-center space-x-4">
          <Button variant="outline" className="text-red-500 hover:text-red-600" onClick={() => setIsSignOutDialogOpen(true)}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-4 px-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.id 
                ? 'text-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-8">
        {/* Appearance Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Appearance</h2>
          <div className="bg-card rounded-xl border p-6 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium">Theme</h3>
                <p className="text-sm text-muted-foreground">Customize how Vimake looks on your device</p>
              </div>
              <Button variant="outline" onClick={toggleTheme} className="space-x-2">
                {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{theme === 'light' ? 'Light' : 'Dark'}</span>
              </Button>
            </div>
          </div>
        </section>

        {/* Language Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Language</h2>
          <div className="bg-card rounded-xl border p-6 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium">Interface Language</h3>
                <p className="text-sm text-muted-foreground">Select your preferred language</p>
              </div>
              <Select.Root value={language} onValueChange={setLanguage}>
                <Select.Trigger className="flex items-center space-x-2 px-4 py-2 rounded-lg border bg-background">
                  <Globe className="w-4 h-4" />
                  <Select.Value />
                  <Select.Icon>
                    <ChevronDown className="w-4 h-4" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-popover border rounded-lg shadow-lg">
                    <Select.Viewport>
                      <Select.Item value="en" className="flex items-center px-4 py-2 hover:bg-accent cursor-pointer">
                        <Select.ItemText>English</Select.ItemText>
                        <Select.ItemIndicator className="ml-2">
                          <Check className="w-4 h-4" />
                        </Select.ItemIndicator>
                      </Select.Item>
                      <Select.Item value="fr" className="flex items-center px-4 py-2 hover:bg-accent cursor-pointer">
                        <Select.ItemText>Français</Select.ItemText>
                        <Select.ItemIndicator className="ml-2">
                          <Check className="w-4 h-4" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>
        </section>

        {/* Subscription Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Subscription</h2>
          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-medium">Free Plan</h3>
                <p className="text-sm text-muted-foreground">You are currently on the free plan</p>
              </div>
              <Button>
                <CreditCard className="w-4 h-4 mr-2" />
                Upgrade Plan
              </Button>
            </div>
          </div>
        </section>

        {/* Affiliation Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Affiliation</h2>
          <div className="bg-card rounded-xl border p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-medium flex items-center gap-2">
                  <Gift className="w-5 h-5 text-primary" />
                  Earn 20% every month for life
                </h3>
                <p className="text-sm text-muted-foreground">Share your unique link and earn commission</p>
              </div>
              <Button variant="outline">Copy Link</Button>
            </div>
          </div>
        </section>

        {/* Sessions Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Active Sessions</h2>
          <div className="bg-card rounded-xl border divide-y">
            {sessions.map((session, index) => (
              <div key={index} className="p-4 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {session.type === 'laptop' ? (
                    <Laptop className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Smartphone className="w-5 h-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">{session.device}</p>
                    <p className="text-sm text-muted-foreground">
                      {session.location} • {session.lastActive}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm">Sign Out</Button>
              </div>
            ))}
          </div>
        </section>

        {/* Danger Zone */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-red-500">Danger Zone</h2>
          <div className="bg-card rounded-xl border border-red-200 dark:border-red-800 p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-medium text-red-500">Delete Account</h3>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your account and all data
                </p>
              </div>
              <Button 
                variant="destructive"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </div>
        </section>

        {activeTab === 'credits' && (
          <div className="space-y-6">
            {/* Credit Balance */}
            <section className="space-y-4">
              <div className="bg-card rounded-xl border p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Total</span>
                        <span className="text-base font-medium">10,000</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Remaining</span>
                        <span className="text-base font-medium">59</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" className="ml-8">
                    <Plus className="w-4 h-4 mr-2" />
                    Upgrade
                  </Button>
                </div>
              </div>
            </section>
            
            {/* Credit History */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">History</h2>
                <Button variant="ghost" size="sm">
                  <History className="w-4 h-4 mr-2" />
                  View All
                </Button>
              </div>
              <div className="bg-card rounded-xl border divide-y">
                {creditHistory.map((item) => (
                  <div key={item.id} className="p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{item.description}</p>
                      <p className="text-sm text-muted-foreground">{item.date}</p>
                    </div>
                    <span className={cn(
                      "font-medium",
                      item.type === 'purchase' ? 'text-green-500' : 'text-primary'
                    )}>
                      {item.type === 'purchase' ? '+' : ''}{item.amount}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Delete Account Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and remove your
              data from our servers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm font-medium">
              Please type "DELETE" to confirm
            </p>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Type DELETE to confirm"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive">
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign Out Dialog */}
      <Dialog open={isSignOutDialogOpen} onOpenChange={setIsSignOutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out of your account?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsSignOutDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="default">
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 