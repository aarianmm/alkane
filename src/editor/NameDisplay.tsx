import type { NameStatus } from "../api/useMoleculeName";
import styles from "./NameDisplay.module.css";

interface NameDisplayProps {
  status: NameStatus;
}

export function NameDisplay({ status }: NameDisplayProps) {
  if (status.status === "loading") {
    return (
      <div className={`${styles.name} ${styles.loading}`} aria-live="polite">
        Naming…
      </div>
    );
  }

  if (status.status === "error") {
    return (
      <div className={`${styles.name} ${styles.error}`} aria-live="polite">
        {status.message}
      </div>
    );
  }

  return (
    <div className={styles.name} aria-live="polite">
      {status.name}
    </div>
  );
}
