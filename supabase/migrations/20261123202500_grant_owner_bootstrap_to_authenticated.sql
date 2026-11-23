-- Allow the signed-in bootstrap owner to invoke the one-time setup RPC.
-- The function itself still enforces the authorized email and an empty system.
grant execute on function public.initialize_inventory_owner(text, text, text)
to authenticated;
