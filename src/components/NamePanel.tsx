import styles from "./NamePanel.module.css";

interface NamePanelProps {
  name?: string;
  isLoading?: boolean;
}

export function NamePanel({ name, isLoading }: NamePanelProps) {
  return (
    <div className={styles.panel}>
      <span className={styles.label}>Systematic name</span>
      <span className={styles.name}>
        {isLoading ? "Naming…" : (name ?? "—")}
      </span>
    </div>
  );
}
