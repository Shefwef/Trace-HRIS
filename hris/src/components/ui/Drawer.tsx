import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import './Drawer.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({ open, onClose, title, subtitle, width = 620, children, footer }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            className="drawer"
            style={{ width }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
            role="dialog"
            aria-modal="true"
          >
            <header className="drawer-header">
              <div>
                {title && <h3>{title}</h3>}
                {subtitle && <p className="drawer-subtitle">{subtitle}</p>}
              </div>
              <button className="drawer-close" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            </header>
            <div className="drawer-body">{children}</div>
            {footer && <footer className="drawer-footer">{footer}</footer>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
