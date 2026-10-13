const styles = {
  error: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-indigo-50 text-indigo-800 ring-indigo-200",
};

export default function Alert({ tone = "error", children }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg p-3 text-sm ring-1 ${styles[tone]}`}>
      {children}
    </div>
  );
}
