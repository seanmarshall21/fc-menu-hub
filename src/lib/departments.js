// Departments drive the "My Tasks" view + phase notifications. A user can be in
// several (user_profiles.departments text[]). Admins see all.
export const DEPARTMENTS = [
  { key: 'sponsorship', label: 'Sponsorship', blurb: 'Add sponsors, flag menus, attach + verify them.' },
  { key: 'food_bev',    label: 'Food & Beverage', blurb: 'Build menus, proof, and approve when sponsors are set.' },
  { key: 'design',      label: 'Design', blurb: 'Sync to Figma, then export approved menus for print.' },
]

export function departmentLabel(key) {
  const d = DEPARTMENTS.find(x => x.key === key)
  return d ? d.label : key
}
