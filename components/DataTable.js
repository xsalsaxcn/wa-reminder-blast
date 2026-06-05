export default function DataTable({ columns = [], rows = [], emptyText = 'Belum ada data.' }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-[#e7ecf5] bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-[#f8fafc] text-xs uppercase tracking-wide text-[#718096]">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-5 py-4 font-bold">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1f7]">
          {rows.length === 0 ? (
            <tr>
              <td className="px-5 py-8 text-center text-[#98a2b3]" colSpan={columns.length || 1}>
                {emptyText}
              </td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={row.id || index} className="hover:bg-[#fbfcff]">
              {columns.map((col) => (
                <td key={col.key} className="px-5 py-4 text-[#344054]">
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
