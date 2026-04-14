import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const newEmail = "bditengineer@gmail.com";
  const newPassword = "KeyaIq11151000@#";

  // Find the super admin user by checking user_roles
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "super_admin");

  if (!roleData || roleData.length === 0) {
    // No super admin exists - create one
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: newEmail,
      password: newPassword,
      email_confirm: true,
    });

    if (createError) {
      return new Response(JSON.stringify({ error: "Create user failed: " + createError.message }), { status: 500 });
    }

    // Create profile
    await supabase.from("profiles").upsert({
      id: newUser.user.id,
      name: "Super Admin",
      email: newEmail,
    });

    // Assign super_admin role
    await supabase.from("user_roles").insert({
      user_id: newUser.user.id,
      role: "super_admin",
    });

    return new Response(JSON.stringify({ success: true, message: "Super admin created", userId: newUser.user.id }));
  }

  const userId = roleData[0].user_id;

  // Try updating existing user
  const { data: updatedUser, error: authError } = await supabase.auth.admin.updateUserById(userId, {
    email: newEmail,
    password: newPassword,
    email_confirm: true,
  });

  if (authError) {
    // If user doesn't exist in auth, create fresh
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: newEmail,
      password: newPassword,
      email_confirm: true,
    });

    if (createError) {
      return new Response(JSON.stringify({ error: "Failed: " + createError.message }), { status: 500 });
    }

    // Update profile to point to new auth user
    await supabase.from("profiles").update({ email: newEmail }).eq("id", userId);
    
    // Update user_roles
    await supabase.from("user_roles").update({ user_id: newUser.user.id }).eq("user_id", userId);
    await supabase.from("profiles").update({ id: newUser.user.id }).eq("id", userId);

    return new Response(JSON.stringify({ success: true, message: "Super admin recreated", userId: newUser.user.id }));
  }

  // Update profiles table
  await supabase.from("profiles").update({ email: newEmail }).eq("id", userId);

  return new Response(JSON.stringify({ success: true, message: "Super admin credentials updated", userId }));
});
