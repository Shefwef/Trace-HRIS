import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import './Modal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: Props) {
  const widths = { sm: 360, md: 480, lg: 640 };
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <div className="modal-wrap" onClick={onClose}>
            <motion.div
              className="modal"
              style={{ width: widths[size] }}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <header className="modal-header">
                <h3>{title}</h3>
                <button className="modal-close" onClick={onClose} aria-label="Close">
                  <X size={18} />
                </button>
              </header>
              <div className="modal-body">{children}</div>
              {footer && <footer className="modal-footer">{footer}</footer>}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
