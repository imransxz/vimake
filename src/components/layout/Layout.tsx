import { useState, cloneElement, isValidElement } from "react";
import { SideMenu } from "@/components/ui/SideMenu";
import { motion } from "framer-motion";

interface ChildProps {
  isOpen?: boolean;
}

interface LayoutProps {
  children: React.ReactElement<ChildProps>;
}

export const Layout = ({ children }: LayoutProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleMenuToggle = (open: boolean) => {
    setIsMenuOpen(open);
  };

  // Clone children and pass isOpen prop if they accept it
  const childrenWithProps = isValidElement(children)
    ? cloneElement(children, { isOpen: isMenuOpen })
    : children;

  return (
    <div className="min-h-screen flex bg-background dark:bg-[#06080D] overflow-hidden">
      <SideMenu onToggle={handleMenuToggle} />
      <motion.div
        className="flex-1"
        animate={{
          marginLeft: isMenuOpen ? "256px" : "80px",
          width: isMenuOpen ? "calc(100% - 256px)" : "calc(100% - 80px)"
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30
        }}
      >
        <div className="p-6 pt-24">
          {childrenWithProps}
        </div>
      </motion.div>
    </div>
  );
}; 