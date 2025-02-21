import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Home, Settings, CreditCard, User, Coins, Gift, FileText, LogOut, ChevronRight, Star, LucideIcon, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import g50Logo from "/g50.svg";
import vWhiteLogo from "/V-White.svg";
import vimakeLogo from "/Vimake.svg";
import vimakeWhiteLogo from "/VimakeWhite.svg";
import folderDarkIcon from '/folderdark.svg';
import folderIcon from '/folder.svg';
import { useTheme } from 'next-themes';
import { CircularProgress } from "@/components/ui/circular-progress";
import * as Popover from "@radix-ui/react-popover";
import { useCredits } from '@/hooks/useCredits';
import ExpandIcon from '/Expand.svg';
import CollapseIcon from '/Collapse.svg';

const FolderIcon = () => {
  const { theme } = useTheme();
  return (
    <img 
      src={folderDarkIcon}
      alt="Shorts" 
      className="w-5 h-5 dark:invert" 
    />
  );
};

interface MenuItem {
  icon: LucideIcon | (() => JSX.Element);
  label: string;
  path: string;
}

const menuItems: MenuItem[] = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: FolderIcon, label: "My Shorts", path: "/shorts" },
];

const buttonTransition = {
  active: {
    scale: 0.95,
    transition: {
      duration: 0.3,
      ease: "easeInOut"
    }
  },
  tap: {
    scale: 0.97,
    transition: {
      duration: 2,
      ease: [0.32, 0.72, 0, 1]
    }
  }
};

interface SideMenuProps {
  onToggle: (isOpen: boolean) => void;
}

export function SideMenu({ onToggle }: SideMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('theme') as 'dark' | 'light') || 'light'
  );
  const { totalCredits, remainingCredits, creditsPercentage } = useCredits();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    onToggle(!isOpen);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark');
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, []);

  const userMenuItems = [
    { icon: Coins, label: "Credits", path: "/settings/credits" },
    { icon: CreditCard, label: "Upgrade", path: "/pricing" },
    { icon: Settings, label: "Subscription", path: "/settings/subscription" },
    { icon: Settings, label: "Settings", path: "/settings" },
    { icon: Gift, label: "Become an affiliate", path: "/settings/affiliate" },
    { icon: FileText, label: "Docs and resources", path: "/docs" },
    { icon: LogOut, label: "Sign out", onClick: () => console.log("Sign out") },
  ];

  return (
    <motion.div 
      initial={false}
      animate={{
        width: isOpen ? 256 : 80
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30
      }}
      className="fixed top-0 left-0 h-full bg-[#F5F5F5] dark:bg-[#06080D] border border-gray-200 dark:border-gray-800 overflow-hidden"
    >
      {/* Logo */}
      <div className={cn(
        "h-16 flex items-center",
        isOpen ? "px-3" : "justify-center"
      )}>
        <img 
          src={isOpen 
            ? theme === 'dark' ? vimakeWhiteLogo : vimakeLogo
            : theme === 'dark' ? vWhiteLogo : g50Logo
          }
          alt="Logo" 
          className={isOpen ? 'h-8' : 'h-8 w-8'} 
        />
      </div>

      {/* Expand/Collapse Button */}
      <button
        onClick={handleToggle}
        className={`fixed ${isOpen ? 'left-[200px]' : 'left-[88px]'} top-5 z-50
          p-2 rounded-xl dark:invert
          transition-all hover:duration-200 active:duration-300 hover:scale-105 active:scale-95`}
      >
        <img 
          src={isOpen ? CollapseIcon : ExpandIcon}
          alt={isOpen ? "Collapse menu" : "Expand menu"}
          className="w-5 h-5"
        />
      </button>

      {/* Create New Video Button */}
      <div className="px-3 mt-6 mb-8">
        <Link
          to="/"
          className={cn(
            "flex items-center justify-center h-10 w-full",
            "bg-white dark:bg-black text-black dark:text-white rounded-full font-medium",
            "border border-gray-200 dark:border-gray-800",
            "transition-all hover:bg-gray-50 dark:hover:bg-gray-900",
            "hover:scale-105 active:scale-95",
            "hover:duration-200 active:duration-300",
            !isOpen && "w-12 mx-auto p-0"
          )}
        >
          {isOpen ? (
            "Create new AI video"
          ) : (
            <Plus className="w-5 h-5" />
          )}
        </Link>
      </div>

      {/* Menu Items */}
      <div className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.label}
            to={item.path}
            className={cn(
              "flex items-center h-10 w-full rounded-lg group",
              "transition-all hover:bg-gray-100 dark:hover:bg-[#06080D]",
              "hover:scale-105 active:scale-95",
              "hover:duration-200 active:duration-300"
            )}
          >
            <motion.div
              className="flex items-center w-full px-3"
              whileTap="tap"
              variants={buttonTransition}
            >
              {item.icon === FolderIcon ? (
                <FolderIcon />
              ) : (
                <item.icon className="w-5 h-5" />
              )}
              <AnimatePresence>
                {isOpen && (
                  <motion.span
                    className="ml-3 text-sm font-medium"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </Link>
        ))}
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0">
        {/* Free Credits Offer */}
        {isOpen && (
          <motion.div
            animate={{
              opacity: isOpen ? 1 : 0,
              height: isOpen ? "auto" : 0
            }}
            transition={{
              duration: 0.2,
              ease: "easeInOut"
            }}
            className="px-4 pb-4"
          >
            <div className="px-3 py-2 bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 
              rounded-xl border border-primary/20 flex items-center justify-between cursor-pointer
              hover:bg-white dark:hover:bg-gray-800 
              transition-all hover:duration-200 active:duration-300 hover:scale-105 active:scale-95">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Get 100 free credits</span>
              </div>
              <ChevronRight className="w-4 h-4 text-primary" />
            </div>
          </motion.div>
        )}
        <div className="p-4 border-t space-y-4">
          {/* User Section */}
          <Popover.Root open={isUserMenuOpen} onOpenChange={setIsUserMenuOpen}>
            <Popover.Trigger asChild>
              <div className={`flex items-center w-full ${isOpen ? 'p-2' : 'p-1'} rounded-xl cursor-pointer`}>
                <div className="relative">
                  <CircularProgress
                    value={creditsPercentage}
                    size={40}
                    strokeWidth={2}
                    className="text-primary"
                  />
                  <div className="absolute inset-0 m-1 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  </div>
                </div>
                <motion.div
                  className="ml-3 overflow-hidden whitespace-nowrap"
                  animate={{
                    width: isOpen ? "auto" : 0,
                    opacity: isOpen ? 1 : 0
                  }}
                  transition={{
                    duration: 0.2,
                    ease: "easeInOut"
                  }}
                >
                  <p className="text-sm font-medium">My Account</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">My Workspace</p>
                </motion.div>
                {isOpen && <ChevronRight className="ml-auto w-4 h-4 text-gray-400" />}
              </div>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="w-64 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-2
                  data-[state=open]:animate-in data-[state=closed]:animate-out
                  data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                  data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                side="right"
                sideOffset={22}
                align="end"
                alignOffset={-40}
              >
                {/* Credits Section */}
                <div className="px-3 py-3 mb-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative">
                      <CircularProgress
                        value={((totalCredits - remainingCredits) / totalCredits) * 100}
                        size={32}
                        strokeWidth={2}
                        className="text-primary"
                      />
                      <div className="absolute inset-0 m-1 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                        <Coins className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      </div>
                    </div>
                    <span className="text-sm font-medium">Credits</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Total</span>
                      <span className="text-sm font-medium">{totalCredits}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Remaining</span>
                      <span className="text-sm font-medium">{remainingCredits}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  {userMenuItems.map((item, index) => (
                    <div key={index} className="relative">
                      {index === userMenuItems.length - 1 && (
                        <div className="absolute inset-x-2 -top-1 h-px bg-gray-200 dark:bg-gray-800" />
                      )}
                      {item.onClick ? (
                        <button
                          onClick={item.onClick}
                          className={`w-full flex items-center px-2 py-2 text-sm rounded-lg
                            ${index === userMenuItems.length - 1 ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 mt-2' : 
                            'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                        >
                          <item.icon className="w-4 h-4 mr-2" />
                          {item.label}
                        </button>
                      ) : (
                        <Link
                          to={item.path}
                          className="w-full flex items-center px-2 py-2 text-sm text-gray-700 dark:text-gray-300 
                            rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <item.icon className="w-4 h-4 mr-2" />
                          {item.label}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
    </motion.div>
  );
} 