
function UserSettingsLayout(props: React.PropsWithChildren) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">Your account</h1>

      {props.children}
    </>
  );
}

export default UserSettingsLayout;
