import AdminPagePermissionSettingsPage from "@/pages/AdminPagePermissionSettingsPage";

/**
 * PermissionsSettings sub-page for AdminSettingsLayout.
 * Wraps the standalone AdminPagePermissionSettingsPage — minor visual nesting
 * from the outer AdminPageShell is acceptable.
 */
export default function PermissionsSettings() {
  return <AdminPagePermissionSettingsPage />;
}
